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

async function readDailyFile(filePath, dateKey) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { date: dateKey, projects: {} };
    }
    throw error;
  }
}

function applySession(dailyData, session) {
  const existing = dailyData.projects[session.repoPath] ?? emptyProjectRecord();
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

  dailyData.projects[session.repoPath] = nextProject;
  return dailyData;
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

  return Object.freeze({
    appendSession
  });
}

module.exports = {
  createStorage,
  toDateKey,
  applySession
};
