const DEFAULT_DEBOUNCE_MS = 120_000;
const ALL_FILES_TOKEN = '__all_files__';
const DIFF_ZERO = Object.freeze({ insertions: 0, deletions: 0 });
const DIFF_METRIC_ZERO = Object.freeze({ insertions: 0, deletions: 0 });
const UNKNOWN_BRANCH = 'unknown';

function toNonNegativeDelta(endValue, startValue) {
  return Math.max(0, endValue - startValue);
}

function resolveSessionMetric(startValue, endValue, commitValue) {
  const workingTreeGrowth = toNonNegativeDelta(endValue, startValue);
  const baselineReduction = toNonNegativeDelta(startValue, endValue);
  const commitCompensation = toNonNegativeDelta(commitValue, baselineReduction);
  return workingTreeGrowth + commitCompensation;
}

function readFileTypeMap(diff) {
  return diff?.byFileType ?? {};
}

function normalizeMetrics(metrics) {
  return {
    insertions: metrics?.insertions ?? 0,
    deletions: metrics?.deletions ?? 0,
    byFileType: readFileTypeMap(metrics)
  };
}

function normalizeDiff(diff) {
  const tracked = normalizeMetrics(diff?.tracked ?? diff ?? DIFF_ZERO);
  const untracked = normalizeMetrics(diff?.untracked ?? DIFF_ZERO);
  const totalCandidate = diff?.tracked || diff?.untracked
    ? {
        insertions: diff?.insertions,
        deletions: diff?.deletions,
        byFileType: diff?.byFileType
      }
    : DIFF_ZERO;
  const total = normalizeMetrics(totalCandidate.insertions === undefined ? {
    insertions: tracked.insertions + untracked.insertions,
    deletions: tracked.deletions + untracked.deletions,
    byFileType: mergeTypeMetrics(tracked.byFileType, untracked.byFileType)
  } : totalCandidate);

  return { tracked, untracked, total };
}

function mergeTypeMetrics(leftMap, rightMap) {
  const output = {};
  Object.entries(leftMap ?? {}).forEach(([fileType, metrics]) => {
    output[fileType] = { insertions: metrics.insertions, deletions: metrics.deletions };
  });
  Object.entries(rightMap ?? {}).forEach(([fileType, metrics]) => {
    const current = output[fileType] ?? DIFF_METRIC_ZERO;
    output[fileType] = {
      insertions: current.insertions + metrics.insertions,
      deletions: current.deletions + metrics.deletions
    };
  });
  return output;
}

function readByTypeMetrics(byType, fileType) {
  return byType[fileType] ?? DIFF_METRIC_ZERO;
}

function buildFileTypeDelta(startMetrics, endMetrics, commitMetrics) {
  const startByType = readFileTypeMap(startMetrics);
  const endByType = readFileTypeMap(endMetrics);
  const commitByType = readFileTypeMap(commitMetrics);
  const fileTypes = new Set([...Object.keys(startByType), ...Object.keys(endByType), ...Object.keys(commitByType)]);
  const output = {};

  fileTypes.forEach((fileType) => {
    const startMetrics = readByTypeMetrics(startByType, fileType);
    const endMetrics = readByTypeMetrics(endByType, fileType);
    const commitMetrics = readByTypeMetrics(commitByType, fileType);
    const locAdded = resolveSessionMetric(startMetrics.insertions, endMetrics.insertions, commitMetrics.insertions);
    const locDeleted = resolveSessionMetric(startMetrics.deletions, endMetrics.deletions, commitMetrics.deletions);
    if (locAdded === 0 && locDeleted === 0) {
      return;
    }
    output[fileType] = { locAdded, locDeleted };
  });

  return output;
}

function sumLocByFileType(locByFileType) {
  return Object.values(locByFileType).reduce(
    (acc, item) => {
      return {
        locAdded: acc.locAdded + item.locAdded,
        locDeleted: acc.locDeleted + item.locDeleted
      };
    },
    { locAdded: 0, locDeleted: 0 }
  );
}

function resolveTotalMetrics(startDiff, endDiff, commitDiff, locByFileType) {
  if (Object.keys(locByFileType).length > 0) {
    return sumLocByFileType(locByFileType);
  }
  return {
    locAdded: resolveSessionMetric(startDiff.insertions, endDiff.insertions, commitDiff?.insertions ?? 0),
    locDeleted: resolveSessionMetric(startDiff.deletions, endDiff.deletions, commitDiff?.deletions ?? 0)
  };
}

function createSession(sessionInput) {
  const durationPenalty = sessionInput.subtractDebounce ? sessionInput.debounceMs : 0;
  const startDiff = normalizeDiff(sessionInput.startDiff);
  const endDiff = normalizeDiff(sessionInput.endDiff);
  const commitDiff = normalizeDiff(sessionInput.commitDiff ?? DIFF_ZERO);
  const trackedLocByFileType = buildFileTypeDelta(startDiff.tracked, endDiff.tracked, commitDiff.tracked);
  const untrackedLocByFileType = buildFileTypeDelta(startDiff.untracked, endDiff.untracked, DIFF_ZERO);
  const locByFileType = mergeLocByFileType(trackedLocByFileType, untrackedLocByFileType);
  const trackedTotal = resolveTotalMetrics(startDiff.tracked, endDiff.tracked, commitDiff.tracked, trackedLocByFileType);
  const untrackedTotal = resolveTotalMetrics(startDiff.untracked, endDiff.untracked, DIFF_ZERO, untrackedLocByFileType);
  return Object.freeze({
    repoPath: sessionInput.repoPath,
    branch: sessionInput.state.branch,
    startTime: sessionInput.state.sessionStartMs,
    endTime: sessionInput.endTime,
    durationMs: Math.max(0, sessionInput.endTime - sessionInput.state.sessionStartMs - durationPenalty),
    trackedLocAdded: trackedTotal.locAdded,
    trackedLocDeleted: trackedTotal.locDeleted,
    untrackedLocAdded: untrackedTotal.locAdded,
    untrackedLocDeleted: untrackedTotal.locDeleted,
    locAdded: trackedTotal.locAdded + untrackedTotal.locAdded,
    locDeleted: trackedTotal.locDeleted + untrackedTotal.locDeleted,
    trackedLocByFileType,
    untrackedLocByFileType,
    locByFileType: locByFileType
  });
}

function mergeLocByFileType(leftMap, rightMap) {
  const output = { ...(leftMap ?? {}) };
  Object.entries(rightMap ?? {}).forEach(([fileType, metrics]) => {
    const current = output[fileType] ?? { locAdded: 0, locDeleted: 0 };
    output[fileType] = {
      locAdded: current.locAdded + metrics.locAdded,
      locDeleted: current.locDeleted + metrics.locDeleted
    };
  });
  return output;
}

function mergeMetricSnapshots(leftMetrics, rightMetrics) {
  return {
    insertions: (leftMetrics?.insertions ?? 0) + (rightMetrics?.insertions ?? 0),
    deletions: (leftMetrics?.deletions ?? 0) + (rightMetrics?.deletions ?? 0),
    byFileType: mergeTypeMetrics(readFileTypeMap(leftMetrics), readFileTypeMap(rightMetrics))
  };
}

function mergeDiffSnapshots(snapshots) {
  return snapshots.reduce((acc, snapshot) => {
    const normalized = normalizeDiff(snapshot);
    return {
      tracked: mergeMetricSnapshots(acc.tracked, normalized.tracked),
      untracked: mergeMetricSnapshots(acc.untracked, normalized.untracked)
    };
  }, {
    tracked: DIFF_ZERO,
    untracked: DIFF_ZERO
  });
}

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

function createTimeTracker(options) {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const now = options.now;
  const getDiff = options.getDiff;
  const getCommitDiff = options.getCommitDiff ?? null;
  const getBranch = options.getBranch ?? (() => UNKNOWN_BRANCH);
  const isUntrackedFile = options.isUntrackedFile ?? null;
  const onSessionFinalized = options.onSessionFinalized;
  const states = new Map();
  const fileDiffCacheByRepo = new Map();
  const seenFilesByRepo = new Map();

  async function readDiff(repoPath, input = {}) {
    return (await Promise.resolve(getDiff(repoPath, input))) ?? DIFF_ZERO;
  }

  async function readBranch(repoPath) {
    const branch = await Promise.resolve(getBranch(repoPath));
    return branch && branch.trim() ? branch.trim() : UNKNOWN_BRANCH;
  }

  function scheduleTimeout(repoPath) {
    const state = states.get(repoPath);
    if (!state) {
      return;
    }

    clearTimeout(state.timeoutHandle);
    state.timeoutHandle = setTimeout(() => {
      void finalizeSession(repoPath, true, null);
    }, debounceMs);
  }

  function getSeenFiles(repoPath) {
    const existing = seenFilesByRepo.get(repoPath);
    if (existing) {
      return existing;
    }
    const created = new Set();
    seenFilesByRepo.set(repoPath, created);
    return created;
  }

  function getFileDiffCache(repoPath) {
    const existing = fileDiffCacheByRepo.get(repoPath);
    if (existing) {
      return existing;
    }
    const created = new Map();
    fileDiffCacheByRepo.set(repoPath, created);
    return created;
  }

  async function rememberTouchedFile(repoPath, state, fsPath) {
    const fileKey = fsPath ?? ALL_FILES_TOKEN;
    if (state.touchedFiles.has(fileKey)) {
      return;
    }
    state.touchedFiles.add(fileKey);
    if (fileKey === ALL_FILES_TOKEN) {
      state.baselineDiffs.set(fileKey, await readDiff(repoPath, {}));
      return;
    }
    const seenFiles = getSeenFiles(repoPath);
    const cachedDiff = getFileDiffCache(repoPath).get(fileKey);
    if (cachedDiff) {
      state.baselineDiffs.set(fileKey, cachedDiff);
      seenFiles.add(fileKey);
      return;
    }
    const isKnownFile = seenFiles.has(fileKey);
    seenFiles.add(fileKey);
    if (!isKnownFile && typeof isUntrackedFile === 'function' && await isUntrackedFile(repoPath, fileKey)) {
      state.baselineDiffs.set(fileKey, DIFF_ZERO);
      return;
    }
    state.baselineDiffs.set(fileKey, await readDiff(repoPath, { files: [fileKey] }));
  }

  async function updateFileDiffCache(repoPath, touchedFiles, endDiff) {
    if (touchedFiles.length === 0 || touchedFiles.includes(ALL_FILES_TOKEN)) {
      return;
    }
    const cache = getFileDiffCache(repoPath);
    if (touchedFiles.length === 1) {
      cache.set(touchedFiles[0], endDiff);
      return;
    }
    const entries = await Promise.all(touchedFiles.map(async (filePath) => {
      return [filePath, await readDiff(repoPath, { files: [filePath] })];
    }));
    entries.forEach(([filePath, diff]) => {
      cache.set(filePath, diff);
    });
  }

  async function ensureActive(repoPath) {
    const existing = states.get(repoPath);
    if (existing) {
      const currentBranch = await readBranch(repoPath);
      if (existing.branch !== currentBranch) {
        await finalizeSession(repoPath, false, null);
        const recreated = createRepoState(now(), currentBranch);
        states.set(repoPath, recreated);
        return recreated;
      }
      return existing;
    }

    const created = createRepoState(now(), await readBranch(repoPath));
    states.set(repoPath, created);
    return created;
  }

  async function resolveCommitDiff(repoPath, commitInput, diffInput) {
    if (!commitInput) {
      return DIFF_ZERO;
    }
    if (typeof commitInput !== 'string') {
      return commitInput;
    }
    if (!diffInput || typeof getCommitDiff !== 'function') {
      return DIFF_ZERO;
    }
    return (await Promise.resolve(getCommitDiff(repoPath, commitInput, diffInput))) ?? DIFF_ZERO;
  }

  async function finalizeSession(repoPath, subtractDebounce, commitInput) {
    const state = states.get(repoPath);
    if (!state || state.status !== 'ACTIVE') {
      return null;
    }

    clearTimeout(state.timeoutHandle);
    const touchedFiles = Array.from(state.touchedFiles);
    const diffInput = buildDiffInput(touchedFiles);
    const endTime = now();
    const startDiff = mergeDiffSnapshots(Array.from(state.baselineDiffs.values()));
    const endDiff = diffInput ? await readDiff(repoPath, diffInput) : DIFF_ZERO;
    const commitDiff = await resolveCommitDiff(repoPath, commitInput, diffInput);
    const session = createSession({
      repoPath,
      state,
      startDiff,
      endTime,
      endDiff,
      commitDiff,
      debounceMs,
      subtractDebounce
    });

    states.delete(repoPath);
    await updateFileDiffCache(repoPath, touchedFiles, endDiff);
    await Promise.resolve(onSessionFinalized(session));
    return session;
  }

  async function recordActivity(repoPath, fsPath = null) {
    const state = await ensureActive(repoPath);
    await rememberTouchedFile(repoPath, state, fsPath);
    scheduleTimeout(repoPath);
  }

  async function handleCommit(repoPath, commitInput = null) {
    const hadRepoWideTracking = states.get(repoPath)?.touchedFiles.has(ALL_FILES_TOKEN) ?? false;
    const finalized = await finalizeSession(repoPath, false, commitInput);
    if (!finalized) {
      return null;
    }

    const restarted = createRepoState(now(), await readBranch(repoPath));
    states.set(repoPath, restarted);
    if (hadRepoWideTracking) {
      await rememberTouchedFile(repoPath, restarted, null);
    }
    scheduleTimeout(repoPath);
    return finalized;
  }

  async function flushAll() {
    const outputs = [];
    for (const repoPath of Array.from(states.keys())) {
      const session = await finalizeSession(repoPath, false);
      if (session) {
        outputs.push(session);
      }
    }
    return outputs;
  }

  async function primeBaseline() {}

  return Object.freeze({
    recordActivity,
    handleCommit,
    flushAll,
    primeBaseline
  });
}

module.exports = {
  createTimeTracker,
  DEFAULT_DEBOUNCE_MS,
  DIFF_ZERO
};
