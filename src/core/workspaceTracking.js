function listWorkspaceFolderPaths(workspaceFolders) {
  const seen = new Set();
  const output = [];

  (Array.isArray(workspaceFolders) ? workspaceFolders : []).forEach((folder) => {
    const fsPath = folder?.uri?.fsPath;
    if (!fsPath || seen.has(fsPath)) {
      return;
    }
    seen.add(fsPath);
    output.push(fsPath);
  });

  return output;
}

async function resolveWorkspaceAllowedPaths(workspaceFolders, discovery) {
  const trackingRoots = Array.isArray(workspaceFolders) && workspaceFolders.every((item) => typeof item === 'string')
    ? workspaceFolders
    : listWorkspaceFolderPaths(workspaceFolders);
  return discovery.resolveAllowedPaths(trackingRoots);
}

module.exports = {
  listWorkspaceFolderPaths,
  resolveWorkspaceAllowedPaths
};
