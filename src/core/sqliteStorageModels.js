const crypto = require('node:crypto');

const { toLocalDateKey } = require('./dateKey');

function emptyProjectRecord() {
  return {
    repoPath: '',
    branch: 'unknown',
    totalActiveTimeMs: 0,
    trackedLocAdded: 0,
    trackedLocDeleted: 0,
    untrackedLocAdded: 0,
    untrackedLocDeleted: 0,
    totalLocAdded: 0,
    totalLocDeleted: 0,
    trackedLocByFileType: {},
    untrackedLocByFileType: {},
    locByFileType: {},
    sessions: []
  };
}

function buildProjectKey(repoPath, branch) {
  const safeBranch = branch && branch.trim() ? branch.trim() : 'unknown';
  if (safeBranch === 'unknown') {
    return repoPath;
  }
  return `${repoPath}||${safeBranch}`;
}

function normalizeProjectRecord(projectKey, record) {
  const output = { ...emptyProjectRecord(), ...(record ?? {}) };
  if (!output.repoPath) {
    output.repoPath = projectKey.split('||')[0] ?? projectKey;
  }
  if (!output.branch) {
    output.branch = 'unknown';
  }
  output.trackedLocAdded = output.trackedLocAdded ?? output.totalLocAdded ?? 0;
  output.trackedLocDeleted = output.trackedLocDeleted ?? output.totalLocDeleted ?? 0;
  output.untrackedLocAdded = output.untrackedLocAdded ?? 0;
  output.untrackedLocDeleted = output.untrackedLocDeleted ?? 0;
  output.trackedLocByFileType = output.trackedLocByFileType ?? output.locByFileType ?? {};
  output.untrackedLocByFileType = output.untrackedLocByFileType ?? {};
  output.locByFileType = output.locByFileType ?? output.trackedLocByFileType ?? {};
  output.sessions = Array.isArray(output.sessions) ? output.sessions : [];
  return output;
}

function mergeLocByFileType(existingMap, deltaMap) {
  const output = { ...(existingMap ?? {}) };
  Object.entries(deltaMap ?? {}).forEach(([fileType, metrics]) => {
    const current = output[fileType] ?? { locAdded: 0, locDeleted: 0 };
    output[fileType] = {
      locAdded: current.locAdded + (metrics.locAdded ?? 0),
      locDeleted: current.locDeleted + (metrics.locDeleted ?? 0)
    };
  });
  return output;
}

function buildReportSummary(projects) {
  return projects.reduce((acc, project) => {
    return {
      totalActiveTimeMs: acc.totalActiveTimeMs + project.totalActiveTimeMs,
      trackedLocAdded: acc.trackedLocAdded + project.trackedLocAdded,
      trackedLocDeleted: acc.trackedLocDeleted + project.trackedLocDeleted,
      untrackedLocAdded: acc.untrackedLocAdded + project.untrackedLocAdded,
      untrackedLocDeleted: acc.untrackedLocDeleted + project.untrackedLocDeleted,
      totalLocAdded: acc.totalLocAdded + project.totalLocAdded,
      totalLocDeleted: acc.totalLocDeleted + project.totalLocDeleted,
      sessionCount: acc.sessionCount + project.sessions.length
    };
  }, {
    totalActiveTimeMs: 0,
    trackedLocAdded: 0,
    trackedLocDeleted: 0,
    untrackedLocAdded: 0,
    untrackedLocDeleted: 0,
    totalLocAdded: 0,
    totalLocDeleted: 0,
    sessionCount: 0
  });
}

function parseMetricMap(rawValue) {
  if (!rawValue) {
    return {};
  }
  const parsed = JSON.parse(rawValue);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function toSessionRecord(row) {
  return {
    branch: row.branch,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMs: row.duration_ms,
    trackedLocAdded: row.tracked_loc_added,
    trackedLocDeleted: row.tracked_loc_deleted,
    untrackedLocAdded: row.untracked_loc_added,
    untrackedLocDeleted: row.untracked_loc_deleted,
    locAdded: row.total_loc_added,
    locDeleted: row.total_loc_deleted,
    trackedLocByFileType: parseMetricMap(row.tracked_loc_by_file_type),
    untrackedLocByFileType: parseMetricMap(row.untracked_loc_by_file_type),
    locByFileType: parseMetricMap(row.loc_by_file_type)
  };
}

function mergeProjectRow(target, row) {
  const trackedLocByFileType = parseMetricMap(row.tracked_loc_by_file_type);
  const untrackedLocByFileType = parseMetricMap(row.untracked_loc_by_file_type);
  const locByFileType = parseMetricMap(row.loc_by_file_type);

  return {
    repoPath: target.repoPath || row.repo_path,
    branch: target.branch && target.branch !== 'unknown' ? target.branch : (row.branch || 'unknown'),
    totalActiveTimeMs: target.totalActiveTimeMs + row.duration_ms,
    trackedLocAdded: target.trackedLocAdded + row.tracked_loc_added,
    trackedLocDeleted: target.trackedLocDeleted + row.tracked_loc_deleted,
    untrackedLocAdded: target.untrackedLocAdded + row.untracked_loc_added,
    untrackedLocDeleted: target.untrackedLocDeleted + row.untracked_loc_deleted,
    totalLocAdded: target.totalLocAdded + row.total_loc_added,
    totalLocDeleted: target.totalLocDeleted + row.total_loc_deleted,
    trackedLocByFileType: mergeLocByFileType(target.trackedLocByFileType, trackedLocByFileType),
    untrackedLocByFileType: mergeLocByFileType(target.untrackedLocByFileType, untrackedLocByFileType),
    locByFileType: mergeLocByFileType(target.locByFileType, locByFileType),
    sessions: target.sessions.concat(toSessionRecord(row))
  };
}

function buildRepoPathClause(repoPaths) {
  if (!Array.isArray(repoPaths)) {
    return { clause: '', params: [] };
  }
  if (repoPaths.length === 0) {
    return { clause: ' AND 0 = 1', params: [] };
  }
  return {
    clause: ` AND repo_path IN (${repoPaths.map(() => '?').join(', ')})`,
    params: repoPaths
  };
}

function normalizeSessionForInsert(session) {
  const trackedLocByFileType = session.trackedLocByFileType ?? session.locByFileType ?? {};
  const untrackedLocByFileType = session.untrackedLocByFileType ?? {};
  const locByFileType = session.locByFileType ?? trackedLocByFileType;
  const totalLocAdded = session.locAdded ?? ((session.trackedLocAdded ?? 0) + (session.untrackedLocAdded ?? 0));
  const totalLocDeleted = session.locDeleted ?? ((session.trackedLocDeleted ?? 0) + (session.untrackedLocDeleted ?? 0));

  return {
    sourceType: 'runtime',
    sourceKey: `runtime:${crypto.randomUUID()}`,
    dateKey: toLocalDateKey(session.endTime),
    repoPath: session.repoPath,
    branch: session.branch && session.branch.trim() ? session.branch.trim() : 'unknown',
    startTime: session.startTime,
    endTime: session.endTime,
    durationMs: session.durationMs ?? 0,
    trackedLocAdded: session.trackedLocAdded ?? totalLocAdded,
    trackedLocDeleted: session.trackedLocDeleted ?? totalLocDeleted,
    untrackedLocAdded: session.untrackedLocAdded ?? 0,
    untrackedLocDeleted: session.untrackedLocDeleted ?? 0,
    totalLocAdded,
    totalLocDeleted,
    trackedLocByFileType,
    untrackedLocByFileType,
    locByFileType
  };
}

module.exports = {
  buildProjectKey,
  buildRepoPathClause,
  buildReportSummary,
  emptyProjectRecord,
  mergeLocByFileType,
  mergeProjectRow,
  normalizeProjectRecord,
  normalizeSessionForInsert,
  parseMetricMap
};
