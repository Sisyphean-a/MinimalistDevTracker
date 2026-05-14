const { toLocalDateKey } = require('./dateKey');
const {
  REPORT_PERIOD_LABELS,
  addDaysToDateKey,
  buildDayRecord,
  buildInclusiveDateRange,
  buildReportDateRange,
  buildTrendWindow,
  normalizeDailyRequest,
  normalizeReportPeriod,
  normalizeReportRequest,
  normalizeTrendRequest,
  normalizeWindows
} = require('./sqliteStoragePeriods');
const {
  buildProjectKey,
  buildRepoPathClause,
  buildReportSummary,
  emptyProjectRecord,
  mergeLocByFileType,
  mergeProjectRow,
  normalizeProjectRecord,
  normalizeSessionForInsert,
  parseMetricMap
} = require('./sqliteStorageModels');

function toDateKey(timestamp) {
  return toLocalDateKey(timestamp);
}

function createAppendSession(databasePromise) {
  return async function appendSession(session) {
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
  };
}

function createReadLatestDaily(databasePromise) {
  return async function readLatestDaily(input = null) {
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
  };
}

function reduceRowsByDate(rows) {
  return rows.reduce((output, row) => {
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
}

function createReadTrendData(databasePromise, now) {
  return async function readTrendData(input = [7, 30]) {
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
    const byDate = reduceRowsByDate(rows);

    return {
      generatedAt: now(),
      windows: normalizedWindows.reduce((output, windowDays) => {
        return {
          ...output,
          [String(windowDays)]: buildTrendWindow(byDate, todayDateKey, windowDays)
        };
      }, {})
    };
  };
}

function appendRowToDayMap(dayMap, row) {
  const day = dayMap.get(row.date_key) ?? buildDayRecord({}, row.date_key);
  dayMap.set(row.date_key, {
    date: row.date_key,
    totalActiveTimeMs: day.totalActiveTimeMs + row.duration_ms,
    trackedLocAdded: day.trackedLocAdded + row.tracked_loc_added,
    trackedLocDeleted: day.trackedLocDeleted + row.tracked_loc_deleted,
    trackedTotalLoc: day.trackedTotalLoc + row.tracked_loc_added + row.tracked_loc_deleted,
    untrackedLocAdded: day.untrackedLocAdded + row.untracked_loc_added,
    untrackedLocDeleted: day.untrackedLocDeleted + row.untracked_loc_deleted,
    untrackedTotalLoc: day.untrackedTotalLoc + row.untracked_loc_added + row.untracked_loc_deleted,
    totalLocAdded: day.totalLocAdded + row.total_loc_added,
    totalLocDeleted: day.totalLocDeleted + row.total_loc_deleted,
    totalLoc: day.totalLoc + row.total_loc_added + row.total_loc_deleted
  });
}

function buildBranchClause(branch) {
  if (!branch || typeof branch !== 'string') {
    return { clause: '', params: [] };
  }

  return {
    clause: ' AND branch = ?',
    params: [branch]
  };
}

function buildProjectBranchClause(projectBranches) {
  if (!Array.isArray(projectBranches)) {
    return { clause: '', params: [] };
  }

  const seen = new Set();
  const normalized = [];
  projectBranches.forEach((item) => {
    const repoPath = typeof item?.repoPath === 'string' ? item.repoPath.trim() : '';
    const branch = typeof item?.branch === 'string' && item.branch.trim() ? item.branch.trim() : 'unknown';
    if (!repoPath) {
      return;
    }
    const key = `${repoPath}||${branch}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push({ branch, repoPath });
  });

  if (normalized.length === 0) {
    return { clause: ' AND 0 = 1', params: [] };
  }

  return {
    clause: ` AND (${normalized.map(() => '(repo_path = ? AND branch = ?)').join(' OR ')})`,
    params: normalized.flatMap((item) => [item.repoPath, item.branch])
  };
}

function createReadReportData(databasePromise, now) {
  return async function readReportData(input = {}) {
    const request = normalizeReportRequest(input);
    const periodType = normalizeReportPeriod(request.periodType);
    const todayDateKey = toDateKey(now());
    const database = await databasePromise;
    const earliest = database.prepare('SELECT MIN(date_key) AS earliestDateKey FROM sessions').get();
    const explicitRange = request.startDate && request.endDate;
    const dateRange = explicitRange
      ? buildInclusiveDateRange(request.startDate, request.endDate)
      : (periodType === 'all'
        ? buildInclusiveDateRange(earliest?.earliestDateKey ?? todayDateKey, todayDateKey)
        : buildReportDateRange(periodType, todayDateKey));
    const dateRangeStart = dateRange[0] ?? todayDateKey;
    const repoFilter = buildRepoPathClause(request.repoPaths);
    const branchFilter = buildBranchClause(request.branch);
    const projectBranchFilter = buildProjectBranchClause(request.projectBranches);
    const rows = database.prepare(`
      SELECT *
      FROM sessions
      WHERE date_key >= ? AND date_key <= ?${repoFilter.clause}${branchFilter.clause}${projectBranchFilter.clause}
      ORDER BY date_key ASC, start_time ASC, id ASC
    `).all(
      dateRangeStart,
      dateRange[dateRange.length - 1] ?? todayDateKey,
      ...repoFilter.params,
      ...branchFilter.params,
      ...projectBranchFilter.params
    );

    const dayMap = new Map(dateRange.map((dateKey) => [dateKey, buildDayRecord({}, dateKey)]));
    const projectMap = new Map();

    rows.forEach((row) => {
      appendRowToDayMap(dayMap, row);
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
  };
}

function createSqliteStorage(options) {
  const databasePromise = options.databasePromise;
  const now = options.now ?? (() => Date.now());
  const appendSession = createAppendSession(databasePromise);
  const readLatestDaily = createReadLatestDaily(databasePromise);
  const readTrendData = createReadTrendData(databasePromise, now);
  const readReportData = createReadReportData(databasePromise, now);
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
