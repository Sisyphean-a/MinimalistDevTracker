const DEFAULT_DEBOUNCE_MS = 120_000;
const DIFF_ZERO = Object.freeze({ insertions: 0, deletions: 0 });
const DIFF_METRIC_ZERO = Object.freeze({ insertions: 0, deletions: 0 });

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

function readByTypeMetrics(byType, fileType) {
  return byType[fileType] ?? DIFF_METRIC_ZERO;
}

function buildFileTypeDelta(startDiff, endDiff, commitDiff) {
  const startByType = readFileTypeMap(startDiff);
  const endByType = readFileTypeMap(endDiff);
  const commitByType = readFileTypeMap(commitDiff);
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
  const commitDiff = sessionInput.commitDiff ?? DIFF_ZERO;
  const startDiff = sessionInput.state.baselineDiff;
  const endDiff = sessionInput.endDiff;
  const locByFileType = buildFileTypeDelta(startDiff, endDiff, commitDiff);
  const totalMetrics = resolveTotalMetrics(startDiff, endDiff, commitDiff, locByFileType);
  return Object.freeze({
    repoPath: sessionInput.repoPath,
    startTime: sessionInput.state.sessionStartMs,
    endTime: sessionInput.endTime,
    durationMs: Math.max(0, sessionInput.endTime - sessionInput.state.sessionStartMs - durationPenalty),
    locAdded: totalMetrics.locAdded,
    locDeleted: totalMetrics.locDeleted,
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
      void finalizeSession(repoPath, true, null);
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

  async function finalizeSession(repoPath, subtractDebounce, commitDiff) {
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
      commitDiff,
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

  async function handleCommit(repoPath, commitDiff = null) {
    const finalized = await finalizeSession(repoPath, false, commitDiff);
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
