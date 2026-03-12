const path = require('node:path');

function normalizePath(inputPath) {
  const normalized = path.resolve(inputPath).replace(/\\/g, '/').toLowerCase();
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function createPathRegistry(allowedRoots) {
  const normalizedRoots = allowedRoots.map((rootPath) => normalizePath(rootPath));

  function isAllowed(targetPath) {
    const normalizedTarget = normalizePath(targetPath);
    return normalizedRoots.some((rootPath) => normalizedTarget.startsWith(rootPath));
  }

  return Object.freeze({
    isAllowed
  });
}

module.exports = {
  createPathRegistry,
  normalizePath
};
