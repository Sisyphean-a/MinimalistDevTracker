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
    const startMetric = readByTypeMetrics(startByType, fileType);
    const endMetric = readByTypeMetrics(endByType, fileType);
    const commitMetric = readByTypeMetrics(commitByType, fileType);
    const locAdded = resolveSessionMetric(startMetric.insertions, endMetric.insertions, commitMetric.insertions);
    const locDeleted = resolveSessionMetric(startMetric.deletions, endMetric.deletions, commitMetric.deletions);
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
    locByFileType
  });
}

module.exports = {
  DIFF_ZERO,
  createSession,
  mergeDiffSnapshots
};
