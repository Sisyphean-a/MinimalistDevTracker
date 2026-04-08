function parseProjectKey(projectKey) {
  const [repoPath] = String(projectKey).split('||');
  return repoPath || String(projectKey);
}

function resolveProjectRepoPath(projectKey, project) {
  return project?.repoPath ?? parseProjectKey(projectKey);
}

function sessionHasLocActivity(session) {
  return ((session?.locAdded ?? 0) + (session?.locDeleted ?? 0)) > 0;
}

function projectHasLocActivity(project) {
  const totalLoc = (project?.totalLocAdded ?? 0) + (project?.totalLocDeleted ?? 0);
  if (totalLoc > 0) {
    return true;
  }
  const sessions = Array.isArray(project?.sessions) ? project.sessions : [];
  return sessions.some(sessionHasLocActivity);
}

function shouldKeepProject(projectKey, project, repoPathSet) {
  if (!projectHasLocActivity(project)) {
    return false;
  }
  if (!repoPathSet) {
    return true;
  }
  return repoPathSet.has(resolveProjectRepoPath(projectKey, project));
}

function createRepoPathSet(repoPaths) {
  if (!Array.isArray(repoPaths)) {
    return null;
  }
  const values = repoPaths.filter((value) => typeof value === 'string' && value.trim());
  return new Set(values);
}

function filterDailyDataByRepoPaths(dailyData, repoPaths) {
  if (!dailyData?.projects || typeof dailyData.projects !== 'object') {
    return null;
  }
  const repoPathSet = createRepoPathSet(repoPaths);
  const projects = Object.entries(dailyData.projects).reduce((output, [projectKey, project]) => {
    if (shouldKeepProject(projectKey, project, repoPathSet)) {
      output[projectKey] = project;
    }
    return output;
  }, {});
  if (Object.keys(projects).length === 0) {
    return null;
  }
  return {
    date: dailyData.date,
    projects
  };
}

function resolveReportRepoPaths(workspaceFolders, pathRegistry) {
  const seen = new Set();
  const output = [];
  const folders = Array.isArray(workspaceFolders) ? workspaceFolders : [];
  folders.forEach((folder) => {
    const fsPath = folder?.uri?.fsPath;
    if (!fsPath) {
      return;
    }
    const repoPath = pathRegistry.resolveRepoPath(fsPath);
    if (!repoPath || seen.has(repoPath)) {
      return;
    }
    seen.add(repoPath);
    output.push(repoPath);
  });
  return output;
}

module.exports = {
  filterDailyDataByRepoPaths,
  projectHasLocActivity,
  resolveProjectRepoPath,
  resolveReportRepoPaths
};
