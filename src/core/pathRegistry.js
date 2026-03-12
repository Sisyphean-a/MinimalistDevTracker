const { createPathNormalizer } = require('./pathKey');

function normalizePath(inputPath, normalizer = createPathNormalizer()) {
  return normalizer.normalizeWithTrailingSlash(inputPath);
}

function trimTrailingSlash(normalizedPath) {
  return normalizedPath.endsWith('/') ? normalizedPath.slice(0, -1) : normalizedPath;
}

function createPathRegistry(allowedRoots, options = {}) {
  const normalizer = options.normalizer ?? createPathNormalizer(options);
  const normalizedRoots = allowedRoots
    .map((rootPath) => normalizePath(rootPath, normalizer))
    .sort((left, right) => right.length - left.length);
  const rootsWithoutSlash = normalizedRoots.map((rootPath) => trimTrailingSlash(rootPath));

  function resolveRepoPath(targetPath) {
    const normalizedTarget = normalizePath(targetPath, normalizer);
    const match = normalizedRoots.find((rootPath) => normalizedTarget.startsWith(rootPath));
    return match ? trimTrailingSlash(match) : null;
  }

  function isAllowed(targetPath) {
    return resolveRepoPath(targetPath) !== null;
  }

  return Object.freeze({
    isAllowed,
    resolveRepoPath,
    getAllowedRoots: () => rootsWithoutSlash.slice()
  });
}

module.exports = {
  createPathRegistry,
  normalizePath
};
