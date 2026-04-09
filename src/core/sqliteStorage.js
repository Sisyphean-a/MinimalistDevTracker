const crypto = require('node:crypto');
const { toLocalDateKey } = require('./dateKey');

const REPORT_PERIOD_LABELS = {
  rolling30: '最近30天',
  month: '本月'
};

function toDateKey(timestamp) {
  return toLocalDateKey(timestamp);
}

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

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map((value) => Number(value));
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function addDaysToDateKey(dateKey, delta) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + delta);
  return toDateKey(date.getTime());
}

function buildDateRange(endDateKey, days) {
  return Array.from({ length: days }).map((_, index) => {
    const delta = index - (days - 1);
    return addDaysToDateKey(endDateKey, delta);
  });
}

function buildDayRecord(byDate, dateKey) {
  const source = byDate[dateKey] ?? {};
  const totalActiveTimeMs = source.totalActiveTimeMs ?? 0;
  const totalLocAdded = source.totalLocAdded ?? 0;
  const totalLocDeleted = source.totalLocDeleted ?? 0;
  return {
    date: dateKey,
    totalActiveTimeMs,
    totalLocAdded,
    totalLocDeleted,
    totalLoc: totalLocAdded + totalLocDeleted
  };
}

function mergeDayTotals(acc, day) {
  return {
    totalActiveTimeMs: acc.totalActiveTimeMs + day.totalActiveTimeMs,
    totalLocAdded: acc.totalLocAdded + day.totalLocAdded,
    totalLocDeleted: acc.totalLocDeleted + day.totalLocDeleted
  };
}

function aggregateFileTypes(byDate, dates) {
  return dates.reduce((output, dateKey) => {
    const day = byDate[dateKey];
    return mergeLocByFileType(output, day?.locByFileType);
  }, {});
}

function computeFileTypeChanges(currentFileTypes, previousFileTypes) {
  const keys = new Set([...Object.keys(currentFileTypes), ...Object.keys(previousFileTypes)]);
  const currentTotal = Object.values(currentFileTypes).reduce((sum, metrics) => sum + (metrics.locAdded ?? 0) + (metrics.locDeleted ?? 0), 0);
  const previousTotal = Object.values(previousFileTypes).reduce((sum, metrics) => sum + (metrics.locAdded ?? 0) + (metrics.locDeleted ?? 0), 0);
  return [...keys]
    .map((fileType) => {
      const currentMetrics = currentFileTypes[fileType] ?? { locAdded: 0, locDeleted: 0 };
      const previousMetrics = previousFileTypes[fileType] ?? { locAdded: 0, locDeleted: 0 };
      const currentTotalLoc = (currentMetrics.locAdded ?? 0) + (currentMetrics.locDeleted ?? 0);
      const previousTotalLoc = (previousMetrics.locAdded ?? 0) + (previousMetrics.locDeleted ?? 0);
      const currentShare = currentTotal === 0 ? 0 : currentTotalLoc / currentTotal;
      const previousShare = previousTotal === 0 ? 0 : previousTotalLoc / previousTotal;
      return {
        fileType,
        currentTotalLoc,
        previousTotalLoc,
        currentShare,
        previousShare,
        deltaShare: currentShare - previousShare
      };
    })
    .sort((left, right) => {
      const deltaGap = Math.abs(right.deltaShare) - Math.abs(left.deltaShare);
      if (deltaGap !== 0) {
        return deltaGap;
      }
      return right.currentTotalLoc - left.currentTotalLoc;
    });
}

function buildTrendWindow(byDate, endDateKey, days) {
  const currentDates = buildDateRange(endDateKey, days);
  const previousEndDateKey = addDaysToDateKey(endDateKey, -days);
  const previousDates = buildDateRange(previousEndDateKey, days);
  const dayRecords = currentDates.map((dateKey) => buildDayRecord(byDate, dateKey));
  const totals = dayRecords.reduce(mergeDayTotals, {
    totalActiveTimeMs: 0,
    totalLocAdded: 0,
    totalLocDeleted: 0
  });
  const currentFileTypes = aggregateFileTypes(byDate, currentDates);
  const previousFileTypes = aggregateFileTypes(byDate, previousDates);
  return {
    days: dayRecords,
    totals: {
      ...totals,
      totalLoc: totals.totalLocAdded + totals.totalLocDeleted
    },
    fileTypeChanges: computeFileTypeChanges(currentFileTypes, previousFileTypes)
  };
}

function normalizeWindows(rawWindows) {
  const windows = Array.isArray(rawWindows) ? rawWindows : [7, 30];
  return windows
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort((left, right) => left - right);
}

function normalizeTrendRequest(input) {
  if (Array.isArray(input) || input === undefined) {
    return {
      windows: input ?? [7, 30],
      repoPaths: null
    };
  }
  return {
    windows: input?.windows ?? [7, 30],
    repoPaths: input?.repoPaths ?? null
  };
}

function normalizeReportRequest(input) {
  return {
    periodType: input?.periodType ?? input?.rangeType ?? input?.period ?? 'rolling30',
    repoPaths: input?.repoPaths ?? null
  };
}

function normalizeDailyRequest(input) {
  return {
    repoPaths: input?.repoPaths ?? null
  };
}

function normalizeReportPeriod(periodType) {
  return periodType === 'month' ? 'month' : 'rolling30';
}

function buildReportPeriodStartDateKey(periodType, todayDateKey) {
  if (periodType === 'month') {
    const start = parseDateKey(todayDateKey);
    start.setDate(1);
    return toDateKey(start.getTime());
  }
  return addDaysToDateKey(todayDateKey, -29);
}

function buildReportDateRange(periodType, todayDateKey) {
  const startDateKey = buildReportPeriodStartDateKey(periodType, todayDateKey);
  const dates = [];
  let current = startDateKey;
  while (current <= todayDateKey) {
    dates.push(current);
    if (current === todayDateKey) {
      break;
    }
    current = addDaysToDateKey(current, 1);
  }
  return dates;
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
    dateKey: toDateKey(session.endTime),
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

function createSqliteStorage(options) {
  const databasePromise = options.databasePromise;
  const now = options.now ?? (() => Date.now());

  async function appendSession(session) {
    const normalized = normalizeSessionForInsert(session);
    if ((normalized.totalLocAdded + normalized.totalLocDeleted) === 0) {
      return;
    }

    const database = await databasePromise;
    database.prepare(`
      INSERT INTO sessions (
        source_type,
        source_key,
        date_key,
        repo_path,
        branch,
        start_time,
        end_time,
        duration_ms,
        tracked_loc_added,
        tracked_loc_deleted,
        untracked_loc_added,
        untracked_loc_deleted,
        total_loc_added,
        total_loc_deleted,
        tracked_loc_by_file_type,
        untracked_loc_by_file_type,
        loc_by_file_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.sourceType,
      normalized.sourceKey,
      normalized.dateKey,
      normalized.repoPath,
      normalized.branch,
      normalized.startTime,
      normalized.endTime,
      normalized.durationMs,
      normalized.trackedLocAdded,
      normalized.trackedLocDeleted,
      normalized.untrackedLocAdded,
      normalized.untrackedLocDeleted,
      normalized.totalLocAdded,
      normalized.totalLocDeleted,
      JSON.stringify(normalized.trackedLocByFileType),
      JSON.stringify(normalized.untrackedLocByFileType),
      JSON.stringify(normalized.locByFileType)
    );
  }

  async function readLatestDaily(input = null) {
    const request = normalizeDailyRequest(input);
    const database = await databasePromise;
    const latest = database.prepare('SELECT MAX(date_key) AS latestDateKey FROM sessions').get();
    const latestDateKey = latest?.latestDateKey ?? null;
    if (!latestDateKey) {
      return null;
    }

    const repoFilter = buildRepoPathClause(request.repoPaths);
    const rows = database.prepare(`
      SELECT *
      FROM sessions
      WHERE date_key = ?${repoFilter.clause}
      ORDER BY start_time ASC, id ASC
    `).all(latestDateKey, ...repoFilter.params);

    if (rows.length === 0) {
      return null;
    }

    const projects = rows.reduce((output, row) => {
      const projectKey = buildProjectKey(row.repo_path, row.branch);
      const existing = output[projectKey] ?? emptyProjectRecord();
      output[projectKey] = mergeProjectRow(existing, row);
      return output;
    }, {});

    return {
      date: latestDateKey,
      projects
    };
  }

  async function readTrendData(input = [7, 30]) {
    const request = normalizeTrendRequest(input);
    const normalizedWindows = normalizeWindows(request.windows);
    const todayDateKey = toDateKey(now());
    const largestWindow = normalizedWindows[normalizedWindows.length - 1] ?? 30;
    const earliestDateKey = addDaysToDateKey(todayDateKey, -((largestWindow * 2) - 1));
    const repoFilter = buildRepoPathClause(request.repoPaths);
    const database = await databasePromise;
    const rows = database.prepare(`
      SELECT *
      FROM sessions
      WHERE date_key >= ? AND date_key <= ?${repoFilter.clause}
      ORDER BY date_key ASC, start_time ASC, id ASC
    `).all(earliestDateKey, todayDateKey, ...repoFilter.params);

    const byDate = rows.reduce((output, row) => {
      const current = output[row.date_key] ?? {
        totalActiveTimeMs: 0,
        totalLocAdded: 0,
        totalLocDeleted: 0,
        locByFileType: {}
      };
      output[row.date_key] = {
        totalActiveTimeMs: current.totalActiveTimeMs + row.duration_ms,
        totalLocAdded: current.totalLocAdded + row.total_loc_added,
        totalLocDeleted: current.totalLocDeleted + row.total_loc_deleted,
        locByFileType: mergeLocByFileType(current.locByFileType, parseMetricMap(row.loc_by_file_type))
      };
      return output;
    }, {});

    return {
      generatedAt: now(),
      windows: normalizedWindows.reduce((output, windowDays) => {
        return {
          ...output,
          [String(windowDays)]: buildTrendWindow(byDate, todayDateKey, windowDays)
        };
      }, {})
    };
  }

  async function readReportData(input = {}) {
    const request = normalizeReportRequest(input);
    const periodType = normalizeReportPeriod(request.periodType);
    const todayDateKey = toDateKey(now());
    const dateRange = buildReportDateRange(periodType, todayDateKey);
    const dateRangeStart = dateRange[0] ?? todayDateKey;
    const repoFilter = buildRepoPathClause(request.repoPaths);
    const database = await databasePromise;
    const rows = database.prepare(`
      SELECT *
      FROM sessions
      WHERE date_key >= ? AND date_key <= ?${repoFilter.clause}
      ORDER BY date_key ASC, start_time ASC, id ASC
    `).all(dateRangeStart, todayDateKey, ...repoFilter.params);

    const dayMap = new Map(dateRange.map((dateKey) => [dateKey, buildDayRecord({}, dateKey)]));
    const projectMap = new Map();

    rows.forEach((row) => {
      const day = dayMap.get(row.date_key) ?? buildDayRecord({}, row.date_key);
      dayMap.set(row.date_key, {
        date: row.date_key,
        totalActiveTimeMs: day.totalActiveTimeMs + row.duration_ms,
        totalLocAdded: day.totalLocAdded + row.total_loc_added,
        totalLocDeleted: day.totalLocDeleted + row.total_loc_deleted,
        totalLoc: day.totalLoc + row.total_loc_added + row.total_loc_deleted
      });

      const projectKey = buildProjectKey(row.repo_path, row.branch);
      const existing = projectMap.get(projectKey) ?? emptyProjectRecord();
      projectMap.set(projectKey, mergeProjectRow(existing, row));
    });

    return {
      periodType,
      periodLabel: REPORT_PERIOD_LABELS[periodType] ?? REPORT_PERIOD_LABELS.rolling30,
      dateRangeStart,
      dateRangeEnd: dateRange[dateRange.length - 1] ?? todayDateKey,
      days: dateRange.map((dateKey) => dayMap.get(dateKey) ?? buildDayRecord({}, dateKey)),
      projects: Object.fromEntries(projectMap.entries()),
      ...buildReportSummary([...projectMap.values()])
    };
  }

  return Object.freeze({
    appendSession,
    readLatestDaily,
    readTrendData,
    readReportData
  });
}

module.exports = {
  createSqliteStorage,
  toDateKey,
  buildProjectKey,
  normalizeProjectRecord
};
