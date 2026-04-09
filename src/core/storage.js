const fs = require('node:fs/promises');
const path = require('node:path');
const { toLocalDateKey } = require('./dateKey');
const { filterDailyDataByRepoPaths } = require('./reportScope');
const { createStorageWriter } = require('./storageWriter');

const TREND_INDEX_FILE = 'trend-index.json';
const TREND_INDEX_VERSION = 1;
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

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function readDailyFile(filePath, dateKey) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { date: dateKey, projects: {} };
    }
    throw error;
  }
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

function applySession(dailyData, session) {
  if ((session.locAdded ?? 0) === 0 && (session.locDeleted ?? 0) === 0) {
    return dailyData;
  }

  const currentProjects = dailyData.projects ?? {};
  const projectKey = buildProjectKey(session.repoPath, session.branch);
  const existing = normalizeProjectRecord(projectKey, currentProjects[projectKey]);
  const trackedLocByFileType = mergeLocByFileType(existing.trackedLocByFileType, session.trackedLocByFileType);
  const untrackedLocByFileType = mergeLocByFileType(existing.untrackedLocByFileType, session.untrackedLocByFileType);
  const locByFileType = mergeLocByFileType(existing.locByFileType, session.locByFileType);
  const nextProject = {
    repoPath: session.repoPath,
    branch: session.branch ?? existing.branch,
    totalActiveTimeMs: existing.totalActiveTimeMs + session.durationMs,
    trackedLocAdded: existing.trackedLocAdded + (session.trackedLocAdded ?? session.locAdded),
    trackedLocDeleted: existing.trackedLocDeleted + (session.trackedLocDeleted ?? session.locDeleted),
    untrackedLocAdded: existing.untrackedLocAdded + (session.untrackedLocAdded ?? 0),
    untrackedLocDeleted: existing.untrackedLocDeleted + (session.untrackedLocDeleted ?? 0),
    totalLocAdded: existing.totalLocAdded + session.locAdded,
    totalLocDeleted: existing.totalLocDeleted + session.locDeleted,
    trackedLocByFileType,
    untrackedLocByFileType,
    locByFileType,
    sessions: existing.sessions.concat({
      branch: session.branch ?? existing.branch,
      startTime: session.startTime,
      endTime: session.endTime,
      durationMs: session.durationMs,
      trackedLocAdded: session.trackedLocAdded ?? session.locAdded,
      trackedLocDeleted: session.trackedLocDeleted ?? session.locDeleted,
      untrackedLocAdded: session.untrackedLocAdded ?? 0,
      untrackedLocDeleted: session.untrackedLocDeleted ?? 0,
      locAdded: session.locAdded,
      locDeleted: session.locDeleted,
      trackedLocByFileType: session.trackedLocByFileType ?? session.locByFileType ?? {},
      untrackedLocByFileType: session.untrackedLocByFileType ?? {},
      locByFileType: session.locByFileType ?? {}
    })
  };

  return {
    date: dailyData.date,
    projects: {
      ...currentProjects,
      [projectKey]: nextProject
    }
  };
}

function emptyTrendIndex() {
  return {
    version: TREND_INDEX_VERSION,
    byDate: {}
  };
}

function normalizeTrendIndex(raw) {
  if (!raw) {
    return emptyTrendIndex();
  }
  if (raw.version !== TREND_INDEX_VERSION || !raw.byDate || typeof raw.byDate !== 'object') {
    throw new Error('invalid trend index format');
  }
  return {
    version: TREND_INDEX_VERSION,
    byDate: { ...raw.byDate }
  };
}

async function readTrendIndex(indexPath) {
  try {
    const raw = await readJson(indexPath);
    return normalizeTrendIndex(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return emptyTrendIndex();
    }
    throw error;
  }
}

function applySessionToTrendIndex(index, session, dateKey) {
  if ((session.locAdded ?? 0) === 0 && (session.locDeleted ?? 0) === 0) {
    return index;
  }
  const current = index.byDate[dateKey] ?? {
    totalActiveTimeMs: 0,
    totalLocAdded: 0,
    totalLocDeleted: 0,
    locByFileType: {}
  };
  const nextDay = {
    totalActiveTimeMs: current.totalActiveTimeMs + (session.durationMs ?? 0),
    totalLocAdded: current.totalLocAdded + (session.locAdded ?? 0),
    totalLocDeleted: current.totalLocDeleted + (session.locDeleted ?? 0),
    locByFileType: mergeLocByFileType(current.locByFileType, session.locByFileType)
  };
  return {
    version: TREND_INDEX_VERSION,
    byDate: {
      ...index.byDate,
      [dateKey]: nextDay
    }
  };
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

function mergeDayTotals(acc, day) {
  return {
    totalActiveTimeMs: acc.totalActiveTimeMs + day.totalActiveTimeMs,
    totalLocAdded: acc.totalLocAdded + day.totalLocAdded,
    totalLocDeleted: acc.totalLocDeleted + day.totalLocDeleted
  };
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

function mergeProjectRecord(target, project) {
  const nextSessions = target.sessions.concat(project.sessions ?? []);
  return {
    repoPath: target.repoPath || project.repoPath,
    branch: target.branch || project.branch || 'unknown',
    totalActiveTimeMs: target.totalActiveTimeMs + (project.totalActiveTimeMs ?? 0),
    trackedLocAdded: target.trackedLocAdded + (project.trackedLocAdded ?? project.totalLocAdded ?? 0),
    trackedLocDeleted: target.trackedLocDeleted + (project.trackedLocDeleted ?? project.totalLocDeleted ?? 0),
    untrackedLocAdded: target.untrackedLocAdded + (project.untrackedLocAdded ?? 0),
    untrackedLocDeleted: target.untrackedLocDeleted + (project.untrackedLocDeleted ?? 0),
    totalLocAdded: target.totalLocAdded + (project.totalLocAdded ?? 0),
    totalLocDeleted: target.totalLocDeleted + (project.totalLocDeleted ?? 0),
    trackedLocByFileType: mergeLocByFileType(target.trackedLocByFileType, project.trackedLocByFileType ?? project.locByFileType),
    untrackedLocByFileType: mergeLocByFileType(target.untrackedLocByFileType, project.untrackedLocByFileType),
    locByFileType: mergeLocByFileType(target.locByFileType, project.locByFileType),
    sessions: nextSessions
  };
}

function emptyReportProjectRecord(project) {
  return {
    repoPath: project.repoPath,
    branch: project.branch,
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

function aggregateFileTypes(byDate, dates) {
  return dates.reduce((output, dateKey) => {
    const day = byDate[dateKey];
    return mergeLocByFileType(output, day?.locByFileType);
  }, {});
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

async function readReportDataFromDailyFiles(globalStoragePath, periodType, repoPaths, todayDateKey) {
  const dateRange = buildReportDateRange(periodType, todayDateKey);
  const dateSet = new Set(dateRange);
  const dayMap = new Map(dateRange.map((dateKey) => [dateKey, buildDayRecord({}, dateKey)]));
  const projectMap = new Map();
  try {
    const files = await fs.readdir(globalStoragePath);
    const sorted = sortDailyFiles(files);
    for (const fileName of sorted) {
      const dateKey = fileName.slice(0, -5);
      if (!dateSet.has(dateKey)) {
        continue;
      }
      const daily = await readJson(path.join(globalStoragePath, fileName));
      const filtered = filterDailyDataByRepoPaths(daily, repoPaths);
      if (!filtered) {
        continue;
      }
      const projects = Object.values(filtered.projects);
      const dayTotals = projects.reduce((acc, project) => {
        return {
          totalActiveTimeMs: acc.totalActiveTimeMs + (project.totalActiveTimeMs ?? 0),
          totalLocAdded: acc.totalLocAdded + (project.totalLocAdded ?? 0),
          totalLocDeleted: acc.totalLocDeleted + (project.totalLocDeleted ?? 0)
        };
      }, {
        totalActiveTimeMs: 0,
        totalLocAdded: 0,
        totalLocDeleted: 0
      });
      dayMap.set(dateKey, {
        date: dateKey,
        totalActiveTimeMs: dayTotals.totalActiveTimeMs,
        totalLocAdded: dayTotals.totalLocAdded,
        totalLocDeleted: dayTotals.totalLocDeleted,
        totalLoc: dayTotals.totalLocAdded + dayTotals.totalLocDeleted
      });
      projects.forEach((project) => {
        const projectKey = buildProjectKey(project.repoPath, project.branch);
        const existing = projectMap.get(projectKey) ?? emptyReportProjectRecord(project);
        projectMap.set(projectKey, mergeProjectRecord(existing, normalizeProjectRecord(projectKey, project)));
      });
    }
    return {
      periodType,
      periodLabel: REPORT_PERIOD_LABELS[periodType] ?? REPORT_PERIOD_LABELS.rolling30,
      dateRangeStart: dateRange[0] ?? todayDateKey,
      dateRangeEnd: dateRange[dateRange.length - 1] ?? todayDateKey,
      days: dateRange.map((dateKey) => dayMap.get(dateKey) ?? buildDayRecord({}, dateKey)),
      projects: Object.fromEntries(projectMap.entries()),
      ...buildReportSummary([...projectMap.values()])
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        periodType,
        periodLabel: REPORT_PERIOD_LABELS[periodType] ?? REPORT_PERIOD_LABELS.rolling30,
        dateRangeStart: dateRange[0] ?? todayDateKey,
        dateRangeEnd: dateRange[dateRange.length - 1] ?? todayDateKey,
        days: dateRange.map((dateKey) => buildDayRecord({}, dateKey)),
        projects: {},
        totalActiveTimeMs: 0,
        trackedLocAdded: 0,
        trackedLocDeleted: 0,
        untrackedLocAdded: 0,
        untrackedLocDeleted: 0,
        totalLocAdded: 0,
        totalLocDeleted: 0,
        sessionCount: 0
      };
    }
    throw error;
  }
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

async function rebuildTrendIndexFromDailyFiles(globalStoragePath, repoPaths = null) {
  try {
    const files = await fs.readdir(globalStoragePath);
    const sorted = sortDailyFiles(files);
    const byDate = {};
    for (const fileName of sorted) {
      const dateKey = fileName.slice(0, -5);
      const daily = await readJson(path.join(globalStoragePath, fileName));
      const filtered = filterDailyDataByRepoPaths(daily, repoPaths);
      if (!filtered) {
        continue;
      }
      const projects = Object.values(filtered.projects);
      const dayTotals = projects.reduce((acc, project) => {
        return {
          totalActiveTimeMs: acc.totalActiveTimeMs + (project.totalActiveTimeMs ?? 0),
          totalLocAdded: acc.totalLocAdded + (project.totalLocAdded ?? 0),
          totalLocDeleted: acc.totalLocDeleted + (project.totalLocDeleted ?? 0),
          locByFileType: mergeLocByFileType(acc.locByFileType, project.locByFileType)
        };
      }, {
        totalActiveTimeMs: 0,
        totalLocAdded: 0,
        totalLocDeleted: 0,
        locByFileType: {}
      });
      byDate[dateKey] = dayTotals;
    }
    return {
      version: TREND_INDEX_VERSION,
      byDate
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return emptyTrendIndex();
    }
    throw error;
  }
}

function sortDailyFiles(fileNames) {
  return fileNames
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort((left, right) => right.localeCompare(left));
}

function createStorage(globalStoragePath, options = {}) {
  const writer = options.writer ?? createStorageWriter();
  const now = options.now ?? (() => Date.now());

  async function appendSession(session) {
    const dateKey = toDateKey(session.endTime);
    const filePath = path.join(globalStoragePath, `${dateKey}.json`);
    await writer.run(filePath, async () => {
      await ensureDirectory(globalStoragePath);
      const dailyData = await readDailyFile(filePath, dateKey);
      const updated = applySession(dailyData, session);
      if (updated === dailyData) {
        return;
      }
      await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf8');
    });
    const trendIndexPath = path.join(globalStoragePath, TREND_INDEX_FILE);
    await writer.run(trendIndexPath, async () => {
      await ensureDirectory(globalStoragePath);
      const index = await readTrendIndex(trendIndexPath);
      const updated = applySessionToTrendIndex(index, session, dateKey);
      if (updated === index) {
        return;
      }
      await fs.writeFile(trendIndexPath, JSON.stringify(updated, null, 2), 'utf8');
    });
  }

  async function readLatestDaily(input = null) {
    const request = normalizeDailyRequest(input);
    try {
      const files = await fs.readdir(globalStoragePath);
      const sorted = sortDailyFiles(files);
      if (sorted.length === 0) {
        return null;
      }
      const latest = await readJson(path.join(globalStoragePath, sorted[0]));
      if (!request.repoPaths) {
        return latest;
      }
      return filterDailyDataByRepoPaths(latest, request.repoPaths);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async function readTrendData(input = [7, 30]) {
    const request = normalizeTrendRequest(input);
    const normalizedWindows = normalizeWindows(request.windows);
    const todayDateKey = toDateKey(now());
    if (request.repoPaths) {
      const trendIndex = await rebuildTrendIndexFromDailyFiles(globalStoragePath, request.repoPaths);
      return {
        generatedAt: now(),
        windows: normalizedWindows.reduce((output, windowDays) => {
          return {
            ...output,
            [String(windowDays)]: buildTrendWindow(trendIndex.byDate, todayDateKey, windowDays)
          };
        }, {})
      };
    }
    const trendIndexPath = path.join(globalStoragePath, TREND_INDEX_FILE);
    let trendIndex = await readTrendIndex(trendIndexPath);
    if (Object.keys(trendIndex.byDate).length === 0) {
      trendIndex = await rebuildTrendIndexFromDailyFiles(globalStoragePath);
      await writer.run(trendIndexPath, async () => {
        await ensureDirectory(globalStoragePath);
        await fs.writeFile(trendIndexPath, JSON.stringify(trendIndex, null, 2), 'utf8');
      });
    }
    const windowsData = normalizedWindows.reduce((output, windowDays) => {
      return {
        ...output,
        [String(windowDays)]: buildTrendWindow(trendIndex.byDate, todayDateKey, windowDays)
      };
    }, {});
    return {
      generatedAt: now(),
      windows: windowsData
    };
  }

  async function readReportData(input = {}) {
    const request = normalizeReportRequest(input);
    const periodType = normalizeReportPeriod(request.periodType);
    const todayDateKey = toDateKey(now());
    if (request.repoPaths) {
      return readReportDataFromDailyFiles(globalStoragePath, periodType, request.repoPaths, todayDateKey);
    }
    return readReportDataFromDailyFiles(globalStoragePath, periodType, null, todayDateKey);
  }

  return Object.freeze({
    appendSession,
    readLatestDaily,
    readTrendData,
    readReportData
  });
}

module.exports = {
  createStorage,
  toDateKey,
  applySession,
  sortDailyFiles,
  buildProjectKey,
  normalizeProjectRecord
};
