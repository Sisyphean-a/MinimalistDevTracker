const DEFAULT_DEBOUNCE_MS = 120_000;
const DIFF_ZERO = Object.freeze({ insertions: 0, deletions: 0 });

function toNonNegativeDelta(endValue, startValue) {
  return Math.max(0, endValue - startValue);
}

function readFileTypeMap(diff) {
  return diff?.byFileType ?? {};
}

function buildFileTypeDelta(endDiff, startDiff) {
  const endByType = readFileTypeMap(endDiff);
  const startByType = readFileTypeMap(startDiff);
  const fileTypes = new Set([...Object.keys(endByType), ...Object.keys(startByType)]);
  const output = {};

  fileTypes.forEach((fileType) => {
    const endMetrics = endByType[fileType] ?? { insertions: 0, deletions: 0 };
    const startMetrics = startByType[fileType] ?? { insertions: 0, deletions: 0 };
    const locAdded = toNonNegativeDelta(endMetrics.insertions, startMetrics.insertions);
    const locDeleted = toNonNegativeDelta(endMetrics.deletions, startMetrics.deletions);
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

function createRepoState(startAt, baselineDiff) {
  return {
    status: 'ACTIVE',
    sessionStartMs: startAt,
    baselineDiff,
    timeoutHandle: null
  };
}

function createSession(sessionInput) {
  const durationPenalty = sessionInput.subtractDebounce ? sessionInput.debounceMs : 0;
  const locByFileType = buildFileTypeDelta(sessionInput.endDiff, sessionInput.state.baselineDiff);
  const locByFileTypeSum = sumLocByFileType(locByFileType);
  const hasTypeBreakdown = Object.keys(locByFileType).length > 0;
  return Object.freeze({
    repoPath: sessionInput.repoPath,
    startTime: sessionInput.state.sessionStartMs,
    endTime: sessionInput.endTime,
    durationMs: Math.max(0, sessionInput.endTime - sessionInput.state.sessionStartMs - durationPenalty),
    locAdded: hasTypeBreakdown
      ? locByFileTypeSum.locAdded
      : toNonNegativeDelta(sessionInput.endDiff.insertions, sessionInput.state.baselineDiff.insertions),
    locDeleted: hasTypeBreakdown
      ? locByFileTypeSum.locDeleted
      : toNonNegativeDelta(sessionInput.endDiff.deletions, sessionInput.state.baselineDiff.deletions),
    locByFileType
  });
}

function createTimeTracker(options) {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const now = options.now;
  const getDiff = options.getDiff;
  const onSessionFinalized = options.onSessionFinalized;
  const states = new Map();

  async function readDiff(repoPath) {
    return (await Promise.resolve(getDiff(repoPath))) ?? DIFF_ZERO;
  }

  function scheduleTimeout(repoPath) {
    const state = states.get(repoPath);
    if (!state) {
      return;
    }

    clearTimeout(state.timeoutHandle);
    state.timeoutHandle = setTimeout(() => {
      void finalizeSession(repoPath, true);
    }, debounceMs);
  }

  async function ensureActive(repoPath) {
    const existing = states.get(repoPath);
    if (existing) {
      return existing;
    }

    const created = createRepoState(now(), await readDiff(repoPath));
    states.set(repoPath, created);
    return created;
  }

  async function finalizeSession(repoPath, subtractDebounce) {
    const state = states.get(repoPath);
    if (!state || state.status !== 'ACTIVE') {
      return null;
    }

    clearTimeout(state.timeoutHandle);
    const endTime = now();
    const endDiff = await readDiff(repoPath);
    const session = createSession({
      repoPath,
      state,
      endTime,
      endDiff,
      debounceMs,
      subtractDebounce
    });

    states.delete(repoPath);
    await Promise.resolve(onSessionFinalized(session));
    return session;
  }

  async function recordActivity(repoPath) {
    await ensureActive(repoPath);
    scheduleTimeout(repoPath);
  }

  async function handleCommit(repoPath) {
    const finalized = await finalizeSession(repoPath, false);
    if (!finalized) {
      return null;
    }

    const restarted = createRepoState(now(), await readDiff(repoPath));
    states.set(repoPath, restarted);
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

  return Object.freeze({
    recordActivity,
    handleCommit,
    flushAll
  });
}

module.exports = {
  createTimeTracker,
  DEFAULT_DEBOUNCE_MS,
  DIFF_ZERO
};
