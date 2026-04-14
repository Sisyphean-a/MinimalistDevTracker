const DEFAULT_DEBOUNCE_MS = 120_000;
const ALL_FILES_TOKEN = '__all_files__';
const UNKNOWN_BRANCH = 'unknown';

const {
  DIFF_ZERO,
  createSession,
  mergeDiffSnapshots
} = require('./timeTrackerMetrics');

function buildDiffInput(touchedFiles) {
  if (touchedFiles.includes(ALL_FILES_TOKEN)) {
    return {};
  }
  return touchedFiles.length === 0 ? null : { files: touchedFiles };
}

function createRepoState(startAt, branch) {
  return {
    status: 'ACTIVE',
    sessionStartMs: startAt,
    branch,
    touchedFiles: new Set(),
    baselineDiffs: new Map(),
    timeoutHandle: null
  };
}

function createTrackerContext(options) {
  return {
    debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
    now: options.now,
    getDiff: options.getDiff,
    getCommitDiff: options.getCommitDiff ?? null,
    getBranch: options.getBranch ?? (() => UNKNOWN_BRANCH),
    isUntrackedFile: options.isUntrackedFile ?? null,
    onSessionFinalized: options.onSessionFinalized,
    states: new Map(),
    fileDiffCacheByRepo: new Map(),
    seenFilesByRepo: new Map()
  };
}

async function readDiff(context, repoPath, input = {}) {
  return (await Promise.resolve(context.getDiff(repoPath, input))) ?? DIFF_ZERO;
}

async function readBranch(context, repoPath) {
  const branch = await Promise.resolve(context.getBranch(repoPath));
  return branch && branch.trim() ? branch.trim() : UNKNOWN_BRANCH;
}

function scheduleTimeout(context, repoPath, finalizeSession) {
  const state = context.states.get(repoPath);
  if (!state) {
    return;
  }

  clearTimeout(state.timeoutHandle);
  state.timeoutHandle = setTimeout(() => {
    void finalizeSession(repoPath, true, null);
  }, context.debounceMs);
}

function getSeenFiles(context, repoPath) {
  const existing = context.seenFilesByRepo.get(repoPath);
  if (existing) {
    return existing;
  }
  const created = new Set();
  context.seenFilesByRepo.set(repoPath, created);
  return created;
}

function getFileDiffCache(context, repoPath) {
  const existing = context.fileDiffCacheByRepo.get(repoPath);
  if (existing) {
    return existing;
  }
  const created = new Map();
  context.fileDiffCacheByRepo.set(repoPath, created);
  return created;
}

async function rememberTouchedFile(context, repoPath, state, fsPath) {
  const fileKey = fsPath ?? ALL_FILES_TOKEN;
  if (state.touchedFiles.has(fileKey)) {
    return;
  }
  state.touchedFiles.add(fileKey);
  if (fileKey === ALL_FILES_TOKEN) {
    state.baselineDiffs.set(fileKey, await readDiff(context, repoPath, {}));
    return;
  }

  const seenFiles = getSeenFiles(context, repoPath);
  const cachedDiff = getFileDiffCache(context, repoPath).get(fileKey);
  if (cachedDiff) {
    state.baselineDiffs.set(fileKey, cachedDiff);
    seenFiles.add(fileKey);
    return;
  }

  const isKnownFile = seenFiles.has(fileKey);
  seenFiles.add(fileKey);
  if (!isKnownFile && typeof context.isUntrackedFile === 'function' && await context.isUntrackedFile(repoPath, fileKey)) {
    state.baselineDiffs.set(fileKey, DIFF_ZERO);
    return;
  }

  state.baselineDiffs.set(fileKey, await readDiff(context, repoPath, { files: [fileKey] }));
}

async function updateFileDiffCache(context, repoPath, touchedFiles, endDiff) {
  if (touchedFiles.length === 0 || touchedFiles.includes(ALL_FILES_TOKEN)) {
    return;
  }

  const cache = getFileDiffCache(context, repoPath);
  if (touchedFiles.length === 1) {
    cache.set(touchedFiles[0], endDiff);
    return;
  }

  const entries = await Promise.all(touchedFiles.map(async (filePath) => {
    return [filePath, await readDiff(context, repoPath, { files: [filePath] })];
  }));
  entries.forEach(([filePath, diff]) => {
    cache.set(filePath, diff);
  });
}

async function ensureActive(context, repoPath, finalizeSession) {
  const existing = context.states.get(repoPath);
  if (existing) {
    const currentBranch = await readBranch(context, repoPath);
    if (existing.branch !== currentBranch) {
      await finalizeSession(repoPath, false, null);
      const recreated = createRepoState(context.now(), currentBranch);
      context.states.set(repoPath, recreated);
      return recreated;
    }
    return existing;
  }

  const created = createRepoState(context.now(), await readBranch(context, repoPath));
  context.states.set(repoPath, created);
  return created;
}

async function resolveCommitDiff(context, repoPath, commitInput, diffInput) {
  if (!commitInput) {
    return DIFF_ZERO;
  }
  if (typeof commitInput !== 'string') {
    return commitInput;
  }
  if (!diffInput || typeof context.getCommitDiff !== 'function') {
    return DIFF_ZERO;
  }
  return (await Promise.resolve(context.getCommitDiff(repoPath, commitInput, diffInput))) ?? DIFF_ZERO;
}

async function finalizeSession(context, repoPath, subtractDebounce, commitInput) {
  const state = context.states.get(repoPath);
  if (!state || state.status !== 'ACTIVE') {
    return null;
  }

  clearTimeout(state.timeoutHandle);
  const touchedFiles = Array.from(state.touchedFiles);
  const diffInput = buildDiffInput(touchedFiles);
  const endTime = context.now();
  const startDiff = mergeDiffSnapshots(Array.from(state.baselineDiffs.values()));
  const endDiff = diffInput ? await readDiff(context, repoPath, diffInput) : DIFF_ZERO;
  const commitDiff = await resolveCommitDiff(context, repoPath, commitInput, diffInput);
  const session = createSession({
    repoPath,
    state,
    startDiff,
    endTime,
    endDiff,
    commitDiff,
    debounceMs: context.debounceMs,
    subtractDebounce
  });

  context.states.delete(repoPath);
  await updateFileDiffCache(context, repoPath, touchedFiles, endDiff);
  await Promise.resolve(context.onSessionFinalized(session));
  return session;
}

async function recordActivity(context, repoPath, fsPath, finalize) {
  const state = await ensureActive(context, repoPath, finalize);
  await rememberTouchedFile(context, repoPath, state, fsPath);
  scheduleTimeout(context, repoPath, finalize);
}

async function handleCommit(context, repoPath, commitInput, finalize) {
  const hadRepoWideTracking = context.states.get(repoPath)?.touchedFiles.has(ALL_FILES_TOKEN) ?? false;
  const finalized = await finalize(repoPath, false, commitInput);
  if (!finalized) {
    return null;
  }

  const restarted = createRepoState(context.now(), await readBranch(context, repoPath));
  context.states.set(repoPath, restarted);
  if (hadRepoWideTracking) {
    await rememberTouchedFile(context, repoPath, restarted, null);
  }
  scheduleTimeout(context, repoPath, finalize);
  return finalized;
}

async function flushAll(context, finalize) {
  const outputs = [];
  for (const repoPath of Array.from(context.states.keys())) {
    const session = await finalize(repoPath, false);
    if (session) {
      outputs.push(session);
    }
  }
  return outputs;
}

function createTimeTracker(options) {
  const context = createTrackerContext(options);
  const finalize = (repoPath, subtractDebounce, commitInput) => finalizeSession(context, repoPath, subtractDebounce, commitInput);

  return Object.freeze({
    recordActivity: (repoPath, fsPath = null) => recordActivity(context, repoPath, fsPath, finalize),
    handleCommit: (repoPath, commitInput = null) => handleCommit(context, repoPath, commitInput, finalize),
    flushAll: () => flushAll(context, finalize),
    primeBaseline: async function primeBaseline() {}
  });
}

module.exports = {
  createTimeTracker,
  DEFAULT_DEBOUNCE_MS,
  DIFF_ZERO
};
