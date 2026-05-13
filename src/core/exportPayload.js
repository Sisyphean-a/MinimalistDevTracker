const { normalizeProjectRecord } = require('./sqliteStorage');

const SESSION_SIZE_THRESHOLD = 50;

function sumLoc(locAdded, locDeleted) {
  return (locAdded ?? 0) + (locDeleted ?? 0);
}

function withLocTotals(record) {
  const totalLocAdded = record.totalLocAdded ?? record.locAdded ?? 0;
  const totalLocDeleted = record.totalLocDeleted ?? record.locDeleted ?? 0;
  return {
    ...record,
    totalLocAdded,
    totalLocDeleted,
    trackedTotalLoc: sumLoc(record.trackedLocAdded, record.trackedLocDeleted),
    untrackedTotalLoc: sumLoc(record.untrackedLocAdded, record.untrackedLocDeleted),
    totalLoc: sumLoc(totalLocAdded, totalLocDeleted)
  };
}

function toProjectList(projects) {
  return Object.entries(projects ?? {}).map(([projectKey, project]) => {
    return normalizeProjectRecord(projectKey, project);
  });
}

function mergeLocMetrics(target, source) {
  const output = { ...(target ?? {}) };
  Object.entries(source ?? {}).forEach(([fileType, metrics]) => {
    const current = output[fileType] ?? { locAdded: 0, locDeleted: 0 };
    output[fileType] = {
      locAdded: current.locAdded + (metrics.locAdded ?? 0),
      locDeleted: current.locDeleted + (metrics.locDeleted ?? 0)
    };
  });
  return output;
}

function toSessionList(projectList) {
  return projectList.flatMap((project) => {
    return (project.sessions ?? []).map((session) => {
      const trackedLocAdded = session.trackedLocAdded ?? 0;
      const trackedLocDeleted = session.trackedLocDeleted ?? 0;
      const untrackedLocAdded = session.untrackedLocAdded ?? 0;
      const untrackedLocDeleted = session.untrackedLocDeleted ?? 0;
      const locAdded = session.locAdded ?? sumLoc(trackedLocAdded, untrackedLocAdded);
      const locDeleted = session.locDeleted ?? sumLoc(trackedLocDeleted, untrackedLocDeleted);

      return withLocTotals({
        repoPath: project.repoPath,
        branch: session.branch ?? project.branch,
        startTime: session.startTime,
        endTime: session.endTime,
        durationMs: session.durationMs ?? 0,
        trackedLocAdded,
        trackedLocDeleted,
        untrackedLocAdded,
        untrackedLocDeleted,
        locAdded,
        locDeleted,
        trackedLocByFileType: session.trackedLocByFileType ?? {},
        untrackedLocByFileType: session.untrackedLocByFileType ?? {},
        locByFileType: session.locByFileType ?? {}
      });
    });
  });
}

function aggregateProjects(projectList) {
  const projectMap = new Map();

  projectList.forEach((project) => {
    const current = projectMap.get(project.repoPath) ?? {
      repoPath: project.repoPath,
      totalActiveTimeMs: 0,
      trackedLocAdded: 0,
      trackedLocDeleted: 0,
      untrackedLocAdded: 0,
      untrackedLocDeleted: 0,
      totalLocAdded: 0,
      totalLocDeleted: 0
    };
    projectMap.set(project.repoPath, {
      ...current,
      totalActiveTimeMs: current.totalActiveTimeMs + project.totalActiveTimeMs,
      trackedLocAdded: current.trackedLocAdded + project.trackedLocAdded,
      trackedLocDeleted: current.trackedLocDeleted + project.trackedLocDeleted,
      untrackedLocAdded: current.untrackedLocAdded + project.untrackedLocAdded,
      untrackedLocDeleted: current.untrackedLocDeleted + project.untrackedLocDeleted,
      totalLocAdded: current.totalLocAdded + project.totalLocAdded,
      totalLocDeleted: current.totalLocDeleted + project.totalLocDeleted
    });
  });

  return [...projectMap.values()]
    .map(withLocTotals)
    .sort((left, right) => right.totalLoc - left.totalLoc);
}

function aggregateBranches(projectList) {
  const branchMap = new Map();

  projectList.forEach((project) => {
    const branchName = project.branch ?? 'unknown';
    const current = branchMap.get(branchName) ?? {
      branch: branchName,
      totalActiveTimeMs: 0,
      trackedLocAdded: 0,
      trackedLocDeleted: 0,
      untrackedLocAdded: 0,
      untrackedLocDeleted: 0,
      totalLocAdded: 0,
      totalLocDeleted: 0
    };
    branchMap.set(branchName, {
      ...current,
      totalActiveTimeMs: current.totalActiveTimeMs + project.totalActiveTimeMs,
      trackedLocAdded: current.trackedLocAdded + project.trackedLocAdded,
      trackedLocDeleted: current.trackedLocDeleted + project.trackedLocDeleted,
      untrackedLocAdded: current.untrackedLocAdded + project.untrackedLocAdded,
      untrackedLocDeleted: current.untrackedLocDeleted + project.untrackedLocDeleted,
      totalLocAdded: current.totalLocAdded + project.totalLocAdded,
      totalLocDeleted: current.totalLocDeleted + project.totalLocDeleted
    });
  });

  return [...branchMap.values()]
    .map(withLocTotals)
    .sort((left, right) => right.totalLoc - left.totalLoc);
}

function aggregateFileTypes(projectList) {
  const trackedMetrics = projectList.reduce((acc, project) => {
    return mergeLocMetrics(acc, project.trackedLocByFileType);
  }, {});
  const untrackedMetrics = projectList.reduce((acc, project) => {
    return mergeLocMetrics(acc, project.untrackedLocByFileType);
  }, {});
  const totalMetrics = projectList.reduce((acc, project) => {
    return mergeLocMetrics(acc, project.locByFileType);
  }, {});
  const fileTypes = new Set([
    ...Object.keys(trackedMetrics),
    ...Object.keys(untrackedMetrics),
    ...Object.keys(totalMetrics)
  ]);

  return [...fileTypes].map((fileType) => {
    const tracked = trackedMetrics[fileType] ?? { locAdded: 0, locDeleted: 0 };
    const untracked = untrackedMetrics[fileType] ?? { locAdded: 0, locDeleted: 0 };
    const total = totalMetrics[fileType] ?? {
      locAdded: tracked.locAdded + untracked.locAdded,
      locDeleted: tracked.locDeleted + untracked.locDeleted
    };
    return {
      fileType,
      trackedLocAdded: tracked.locAdded ?? 0,
      trackedLocDeleted: tracked.locDeleted ?? 0,
      untrackedLocAdded: untracked.locAdded ?? 0,
      untrackedLocDeleted: untracked.locDeleted ?? 0,
      locAdded: total.locAdded ?? 0,
      locDeleted: total.locDeleted ?? 0
    };
  }).sort((left, right) => {
    return sumLoc(right.locAdded, right.locDeleted) - sumLoc(left.locAdded, left.locDeleted);
  });
}

function dayHasActivity(day) {
  return sumLoc(day.totalLocAdded, day.totalLocDeleted) > 0 || (day.totalActiveTimeMs ?? 0) > 0;
}

function trimLeadingAndTrailingEmptyDays(days) {
  const dayList = Array.isArray(days) ? days : [];
  if (dayList.length === 0) {
    return dayList;
  }

  let startIndex = -1;
  let endIndex = -1;

  for (let index = 0; index < dayList.length; index += 1) {
    if (!dayHasActivity(dayList[index])) {
      continue;
    }
    if (startIndex < 0) {
      startIndex = index;
    }
    endIndex = index;
  }

  if (startIndex < 0 || endIndex < 0) {
    return dayList;
  }
  return dayList.slice(startIndex, endIndex + 1);
}

function countActiveDays(days) {
  return (days ?? []).filter(dayHasActivity).length;
}

function buildExportPayload(reportData, input, now = Date.now()) {
  const projectList = toProjectList(reportData.projects);
  const sessions = toSessionList(projectList);
  const projects = aggregateProjects(projectList);
  const branches = aggregateBranches(projectList);
  const fileTypes = aggregateFileTypes(projectList);
  const requestedDays = Array.isArray(reportData.days) ? reportData.days : [];
  const days = trimLeadingAndTrailingEmptyDays(requestedDays);
  const requestedStartDate = input.startDate ?? reportData.dateRangeStart;
  const requestedEndDate = input.endDate ?? reportData.dateRangeEnd;
  const startDate = days[0]?.date ?? requestedStartDate;
  const endDate = days[days.length - 1]?.date ?? requestedEndDate;

  return {
    metadata: {
      exportedAt: now,
      exportedAtIso: new Date(now).toISOString(),
      exportType: input.exportType,
      format: input.format,
      scopeType: input.scopeType,
      repoPaths: input.repoPaths ?? null,
      branchMode: input.branchMode,
      branchName: input.branch ?? null,
      requestedStartDate,
      requestedEndDate,
      startDate,
      endDate,
      sessionSizeThreshold: SESSION_SIZE_THRESHOLD,
      showProjectContribution: input.scopeType === 'all',
      showBranchContribution: input.branchMode === 'all'
    },
    summary: {
      totalActiveTimeMs: reportData.totalActiveTimeMs ?? 0,
      totalTrackedLocAdded: reportData.trackedLocAdded ?? 0,
      totalTrackedLocDeleted: reportData.trackedLocDeleted ?? 0,
      totalTrackedLoc: sumLoc(reportData.trackedLocAdded, reportData.trackedLocDeleted),
      totalUntrackedLocAdded: reportData.untrackedLocAdded ?? 0,
      totalUntrackedLocDeleted: reportData.untrackedLocDeleted ?? 0,
      totalUntrackedLoc: sumLoc(reportData.untrackedLocAdded, reportData.untrackedLocDeleted),
      totalLocAdded: reportData.totalLocAdded ?? 0,
      totalLocDeleted: reportData.totalLocDeleted ?? 0,
      totalLoc: sumLoc(reportData.totalLocAdded, reportData.totalLocDeleted),
      sessionCount: sessions.length,
      projectCount: projects.length,
      branchCount: branches.length,
      activeDayCount: countActiveDays(days)
    },
    days,
    projects,
    branches,
    fileTypes,
    sessions
  };
}

module.exports = {
  buildExportPayload,
  SESSION_SIZE_THRESHOLD
};
