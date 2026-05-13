const { toLocalDateKey } = require('./dateKey');
const { mergeLocByFileType } = require('./sqliteStorageModels');

const REPORT_PERIOD_LABELS = {
  rolling30: '最近30天',
  month: '本月',
  rolling90: '最近3个月',
  rolling180: '最近半年',
  rolling365: '最近1年',
  all: '全部'
};

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map((value) => Number(value));
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function addDaysToDateKey(dateKey, delta) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + delta);
  return toLocalDateKey(date.getTime());
}

function buildDateRange(endDateKey, days) {
  return Array.from({ length: days }).map((_, index) => {
    const delta = index - (days - 1);
    return addDaysToDateKey(endDateKey, delta);
  });
}

function buildInclusiveDateRange(startDateKey, endDateKey) {
  const dates = [];
  let current = startDateKey;

  while (current <= endDateKey) {
    dates.push(current);
    if (current === endDateKey) {
      break;
    }
    current = addDaysToDateKey(current, 1);
  }

  return dates;
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
    repoPaths: input?.repoPaths ?? null,
    startDate: input?.startDate ?? null,
    endDate: input?.endDate ?? null,
    branch: input?.branch ?? null
  };
}

function normalizeDailyRequest(input) {
  return {
    repoPaths: input?.repoPaths ?? null
  };
}

function normalizeReportPeriod(periodType) {
  if (REPORT_PERIOD_LABELS[periodType]) {
    return periodType;
  }
  return 'rolling30';
}

function buildReportPeriodStartDateKey(periodType, todayDateKey) {
  if (periodType === 'month') {
    const start = parseDateKey(todayDateKey);
    start.setDate(1);
    return toLocalDateKey(start.getTime());
  }
  if (periodType === 'rolling90') {
    return addDaysToDateKey(todayDateKey, -89);
  }
  if (periodType === 'rolling180') {
    return addDaysToDateKey(todayDateKey, -179);
  }
  if (periodType === 'rolling365') {
    return addDaysToDateKey(todayDateKey, -364);
  }
  return addDaysToDateKey(todayDateKey, -29);
}

function buildReportDateRange(periodType, todayDateKey) {
  const startDateKey = buildReportPeriodStartDateKey(periodType, todayDateKey);
  return buildInclusiveDateRange(startDateKey, todayDateKey);
}

module.exports = {
  REPORT_PERIOD_LABELS,
  addDaysToDateKey,
  buildDateRange,
  buildDayRecord,
  buildInclusiveDateRange,
  buildReportDateRange,
  buildTrendWindow,
  normalizeDailyRequest,
  normalizeReportPeriod,
  normalizeReportRequest,
  normalizeTrendRequest,
  normalizeWindows
};
