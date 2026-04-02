const fs = require('node:fs/promises');
const path = require('node:path');
const { toLocalDateKey } = require('./dateKey');
const { createStorageWriter } = require('./storageWriter');

const TREND_INDEX_FILE = 'trend-index.json';
const TREND_INDEX_VERSION = 1;

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

async function rebuildTrendIndexFromDailyFiles(globalStoragePath) {
  try {
    const files = await fs.readdir(globalStoragePath);
    const sorted = sortDailyFiles(files);
    const byDate = {};
    for (const fileName of sorted) {
      const dateKey = fileName.slice(0, -5);
      const daily = await readJson(path.join(globalStoragePath, fileName));
      const projects = Object.values(daily.projects ?? {});
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

  async function readLatestDaily() {
    try {
      const files = await fs.readdir(globalStoragePath);
      const sorted = sortDailyFiles(files);
      if (sorted.length === 0) {
        return null;
      }
      return readJson(path.join(globalStoragePath, sorted[0]));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async function readTrendData(windows = [7, 30]) {
    const normalizedWindows = normalizeWindows(windows);
    const todayDateKey = toDateKey(now());
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

  return Object.freeze({
    appendSession,
    readLatestDaily,
    readTrendData
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
