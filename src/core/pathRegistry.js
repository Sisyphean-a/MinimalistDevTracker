const path = require('node:path');

function normalizePath(inputPath) {
  const normalized = path.resolve(inputPath).replace(/\\/g, '/').toLowerCase();
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function trimTrailingSlash(normalizedPath) {
  return normalizedPath.endsWith('/') ? normalizedPath.slice(0, -1) : normalizedPath;
}

function createPathRegistry(allowedRoots) {
  const normalizedRoots = allowedRoots
    .map((rootPath) => normalizePath(rootPath))
    .sort((left, right) => right.length - left.length);

  function resolveRepoPath(targetPath) {
    const normalizedTarget = normalizePath(targetPath);
    const match = normalizedRoots.find((rootPath) => normalizedTarget.startsWith(rootPath));
    return match ? trimTrailingSlash(match) : null;
  }

  function isAllowed(targetPath) {
    return resolveRepoPath(targetPath) !== null;
  }

  return Object.freeze({
    isAllowed,
    resolveRepoPath
  });
}

module.exports = {
  createPathRegistry,
  normalizePath
};
