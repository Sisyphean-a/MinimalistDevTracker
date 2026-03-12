const fs = require('node:fs/promises');
const path = require('node:path');

function toDateKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function emptyProjectRecord() {
  return {
    totalActiveTimeMs: 0,
    totalLocAdded: 0,
    totalLocDeleted: 0,
    sessions: []
  };
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function readDailyFile(filePath, dateKey) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { date: dateKey, projects: {} };
    }
    throw error;
  }
}

function applySession(dailyData, session) {
  const currentProjects = dailyData.projects ?? {};
  const existing = currentProjects[session.repoPath] ?? emptyProjectRecord();
  const nextProject = {
    totalActiveTimeMs: existing.totalActiveTimeMs + session.durationMs,
    totalLocAdded: existing.totalLocAdded + session.locAdded,
    totalLocDeleted: existing.totalLocDeleted + session.locDeleted,
    sessions: existing.sessions.concat({
      startTime: session.startTime,
      endTime: session.endTime,
      durationMs: session.durationMs,
      locAdded: session.locAdded,
      locDeleted: session.locDeleted
    })
  };

  return {
    date: dailyData.date,
    projects: {
      ...currentProjects,
      [session.repoPath]: nextProject
    }
  };
}

function sortDailyFiles(fileNames) {
  return fileNames
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort((left, right) => right.localeCompare(left));
}

function createStorage(globalStoragePath) {
  async function appendSession(session) {
    const dateKey = toDateKey(session.endTime);
    const filePath = path.join(globalStoragePath, `${dateKey}.json`);
    await ensureDirectory(globalStoragePath);
    const dailyData = await readDailyFile(filePath, dateKey);
    const updated = applySession(dailyData, session);
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf8');
  }

  async function readLatestDaily() {
    try {
      const files = await fs.readdir(globalStoragePath);
      const sorted = sortDailyFiles(files);
      if (sorted.length === 0) {
        return null;
      }
      return readJson(path.join(globalStoragePath, sorted[0]));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  return Object.freeze({
    appendSession,
    readLatestDaily
  });
}

module.exports = {
  createStorage,
  toDateKey,
  applySession,
  sortDailyFiles
};
