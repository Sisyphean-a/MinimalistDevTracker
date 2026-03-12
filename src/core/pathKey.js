const path = require('node:path');

function isCaseSensitivePlatform(platform = process.platform) {
  return platform !== 'win32';
}

function createPathNormalizer(options = {}) {
  const caseSensitive = options.caseSensitive ?? isCaseSensitivePlatform(options.platform);

  function normalize(inputPath) {
    const resolved = path.resolve(inputPath).replace(/\\/g, '/');
    return caseSensitive ? resolved : resolved.toLowerCase();
  }

  function normalizeWithTrailingSlash(inputPath) {
    const normalized = normalize(inputPath);
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }

  return Object.freeze({
    caseSensitive,
    normalize,
    normalizeWithTrailingSlash
  });
}

module.exports = {
  createPathNormalizer,
  isCaseSensitivePlatform
};
