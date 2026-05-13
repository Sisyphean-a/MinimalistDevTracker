const { normalizeProjectRecord } = require('./sqliteStorage');

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
    return (project.sessions ?? []).map((session) => ({
      repoPath: project.repoPath,
      branch: session.branch ?? project.branch,
      startTime: session.startTime,
      endTime: session.endTime,
      durationMs: session.durationMs ?? 0,
      trackedLocAdded: session.trackedLocAdded ?? 0,
      trackedLocDeleted: session.trackedLocDeleted ?? 0,
      untrackedLocAdded: session.untrackedLocAdded ?? 0,
      untrackedLocDeleted: session.untrackedLocDeleted ?? 0,
      locAdded: session.locAdded ?? 0,
      locDeleted: session.locDeleted ?? 0
    }));
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

  return [...projectMap.values()].sort((left, right) => {
    return (right.totalLocAdded + right.totalLocDeleted) - (left.totalLocAdded + left.totalLocDeleted);
  });
}

function aggregateBranches(projectList) {
  const branchMap = new Map();

  projectList.forEach((project) => {
    const current = branchMap.get(project.branch) ?? {
      branch: project.branch,
      totalActiveTimeMs: 0,
      trackedLocAdded: 0,
      trackedLocDeleted: 0,
      untrackedLocAdded: 0,
      untrackedLocDeleted: 0,
      totalLocAdded: 0,
      totalLocDeleted: 0
    };
    branchMap.set(project.branch, {
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

  return [...branchMap.values()].sort((left, right) => {
    return (right.totalLocAdded + right.totalLocDeleted) - (left.totalLocAdded + left.totalLocDeleted);
  });
}

function aggregateFileTypes(projectList) {
  const merged = projectList.reduce((acc, project) => {
    return mergeLocMetrics(acc, project.locByFileType);
  }, {});

  return Object.entries(merged).map(([fileType, metrics]) => ({
    fileType,
    locAdded: metrics.locAdded ?? 0,
    locDeleted: metrics.locDeleted ?? 0
  })).sort((left, right) => {
    return (right.locAdded + right.locDeleted) - (left.locAdded + left.locDeleted);
  });
}

function countActiveDays(days) {
  return (days ?? []).filter((day) => {
    return (day.totalActiveTimeMs ?? 0) > 0 || (day.totalLoc ?? 0) > 0;
  }).length;
}

function buildExportPayload(reportData, input, now = Date.now()) {
  const projectList = toProjectList(reportData.projects);
  const sessions = toSessionList(projectList);
  const projects = aggregateProjects(projectList);
  const branches = aggregateBranches(projectList);
  const fileTypes = aggregateFileTypes(projectList);
  const days = Array.isArray(reportData.days) ? reportData.days : [];

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
      startDate: input.startDate ?? reportData.dateRangeStart,
      endDate: input.endDate ?? reportData.dateRangeEnd
    },
    summary: {
      totalActiveTimeMs: reportData.totalActiveTimeMs ?? 0,
      totalTrackedLocAdded: reportData.trackedLocAdded ?? 0,
      totalTrackedLocDeleted: reportData.trackedLocDeleted ?? 0,
      totalUntrackedLocAdded: reportData.untrackedLocAdded ?? 0,
      totalUntrackedLocDeleted: reportData.untrackedLocDeleted ?? 0,
      totalLocAdded: reportData.totalLocAdded ?? 0,
      totalLocDeleted: reportData.totalLocDeleted ?? 0,
      totalLoc: (reportData.totalLocAdded ?? 0) + (reportData.totalLocDeleted ?? 0),
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
  buildExportPayload
};
