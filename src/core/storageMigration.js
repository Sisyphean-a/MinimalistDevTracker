const fs = require('node:fs/promises');
const path = require('node:path');

const DAILY_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.json$/;
const TREND_INDEX_FILE = 'trend-index.json';

function assertAbsoluteDirectory(inputPath, fieldName) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  if (!path.isAbsolute(inputPath)) {
    throw new Error(`${fieldName} must be an absolute path`);
  }
}

function filterDailyFiles(names) {
  return names.filter((name) => DAILY_FILE_PATTERN.test(name));
}

async function ensureSourceReadable(sourceDir) {
  try {
    await fs.access(sourceDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`source storage does not exist: ${sourceDir}`);
    }
    throw error;
  }
}

async function copyMissingDailyFiles(sourceDir, targetDir) {
  const names = await fs.readdir(sourceDir);
  const dailyFiles = filterDailyFiles(names);
  let copiedFiles = 0;
  let skippedFiles = 0;
  for (const fileName of dailyFiles) {
    const sourceFile = path.join(sourceDir, fileName);
    const targetFile = path.join(targetDir, fileName);
    try {
      await fs.access(targetFile);
      skippedFiles += 1;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      await fs.copyFile(sourceFile, targetFile);
      copiedFiles += 1;
    }
  }
  return { copiedFiles, skippedFiles };
}

async function dropTargetTrendIndex(targetDir) {
  const trendIndexPath = path.join(targetDir, TREND_INDEX_FILE);
  try {
    await fs.unlink(trendIndexPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function migrateLegacyStorageData(options) {
  const sourceDir = options.sourceDir;
  const targetDir = options.targetDir;
  assertAbsoluteDirectory(sourceDir, 'sourceDir');
  assertAbsoluteDirectory(targetDir, 'targetDir');
  if (path.resolve(sourceDir) === path.resolve(targetDir)) {
    throw new Error('sourceDir and targetDir cannot be the same');
  }

  await ensureSourceReadable(sourceDir);
  await fs.mkdir(targetDir, { recursive: true });
  const fileSummary = await copyMissingDailyFiles(sourceDir, targetDir);
  await dropTargetTrendIndex(targetDir);
  return {
    ...fileSummary,
    sourceDir,
    targetDir
  };
}

module.exports = {
  migrateLegacyStorageData
};

