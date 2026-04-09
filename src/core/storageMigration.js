const fs = require('node:fs/promises');
const path = require('node:path');

const { openDatabase } = require('./sqliteDatabase');
const { buildProjectKey } = require('./sqliteStorage');

const DAILY_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.json$/;

function assertAbsoluteDirectory(inputPath, fieldName) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  if (!path.isAbsolute(inputPath)) {
    throw new Error(`${fieldName} must be an absolute path`);
  }
}

async function sourceExists(sourceDir) {
  try {
    await fs.access(sourceDir);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function normalizeMetricMap(value) {
  return value && typeof value === 'object' ? value : {};
}

function buildLegacySourceKey(input) {
  return [
    'legacy-json',
    input.dateKey,
    input.projectKey,
    input.sessionIndex,
    input.startTime,
    input.endTime,
    input.durationMs,
    input.totalLocAdded,
    input.totalLocDeleted
  ].join(':');
}

function normalizeLegacySession(input) {
  const session = input.session;
  const repoPath = input.project.repoPath ?? String(input.projectKey).split('||')[0];
  const branch = session.branch ?? input.project.branch ?? 'unknown';
  const totalLocAdded = session.locAdded ?? ((session.trackedLocAdded ?? 0) + (session.untrackedLocAdded ?? 0));
  const totalLocDeleted = session.locDeleted ?? ((session.trackedLocDeleted ?? 0) + (session.untrackedLocDeleted ?? 0));

  if (!repoPath || !Number.isFinite(session.startTime) || !Number.isFinite(session.endTime) || !Number.isFinite(session.durationMs)) {
    return null;
  }

  if ((totalLocAdded + totalLocDeleted) === 0) {
    return null;
  }

  const trackedLocByFileType = normalizeMetricMap(session.trackedLocByFileType ?? session.locByFileType);
  const untrackedLocByFileType = normalizeMetricMap(session.untrackedLocByFileType);
  const locByFileType = normalizeMetricMap(session.locByFileType ?? trackedLocByFileType);
  const projectKey = buildProjectKey(repoPath, branch);

  return {
    sourceType: 'legacy-json',
    sourceKey: buildLegacySourceKey({
      dateKey: input.dateKey,
      projectKey,
      sessionIndex: input.sessionIndex,
      startTime: session.startTime,
      endTime: session.endTime,
      durationMs: session.durationMs,
      totalLocAdded,
      totalLocDeleted
    }),
    dateKey: input.dateKey,
    repoPath,
    branch,
    startTime: session.startTime,
    endTime: session.endTime,
    durationMs: session.durationMs,
    trackedLocAdded: session.trackedLocAdded ?? totalLocAdded,
    trackedLocDeleted: session.trackedLocDeleted ?? totalLocDeleted,
    untrackedLocAdded: session.untrackedLocAdded ?? 0,
    untrackedLocDeleted: session.untrackedLocDeleted ?? 0,
    totalLocAdded,
    totalLocDeleted,
    trackedLocByFileType,
    untrackedLocByFileType,
    locByFileType
  };
}

async function collectLegacySessions(sourceDir) {
  const names = await fs.readdir(sourceDir);
  const dailyFiles = names.filter((name) => DAILY_FILE_PATTERN.test(name)).sort();
  const summary = {
    scannedFiles: 0,
    skippedSessions: 0,
    failedFiles: []
  };
  const sessions = [];

  for (const fileName of dailyFiles) {
    const dateKey = fileName.slice(0, -5);
    const filePath = path.join(sourceDir, fileName);
    summary.scannedFiles += 1;

    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      summary.failedFiles.push(fileName);
      throw error;
    }

    const projects = parsed?.projects && typeof parsed.projects === 'object' ? parsed.projects : {};
    Object.entries(projects).forEach(([projectKey, project]) => {
      const projectSessions = Array.isArray(project?.sessions) ? project.sessions : [];
      projectSessions.forEach((session, sessionIndex) => {
        const normalized = normalizeLegacySession({
          dateKey,
          projectKey,
          project: project ?? {},
          session,
          sessionIndex
        });
        if (!normalized) {
          summary.skippedSessions += 1;
          return;
        }
        sessions.push(normalized);
      });
    });
  }

  return {
    sessions,
    summary
  };
}

async function migrateLegacyStorageData(options) {
  const sourceDir = options.sourceDir;
  const targetDir = options.targetDir;
  const databasePath = path.join(targetDir, 'storage.db');

  assertAbsoluteDirectory(sourceDir, 'sourceDir');
  assertAbsoluteDirectory(targetDir, 'targetDir');

  await fs.mkdir(targetDir, { recursive: true });
  const hasSourceDir = await sourceExists(sourceDir);
  const { sessions, summary } = hasSourceDir
    ? await collectLegacySessions(sourceDir)
    : {
        sessions: [],
        summary: {
          scannedFiles: 0,
          skippedSessions: 0,
          failedFiles: []
        }
      };
  const database = await openDatabase(databasePath);
  const insertStatement = database.prepare(`
    INSERT OR IGNORE INTO sessions (
      source_type,
      source_key,
      date_key,
      repo_path,
      branch,
      start_time,
      end_time,
      duration_ms,
      tracked_loc_added,
      tracked_loc_deleted,
      untracked_loc_added,
      untracked_loc_deleted,
      total_loc_added,
      total_loc_deleted,
      tracked_loc_by_file_type,
      untracked_loc_by_file_type,
      loc_by_file_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const changesStatement = database.prepare('SELECT changes() AS changes');

  const counts = {
    importedSessions: 0,
    ignoredExistingSessions: 0
  };

  database.transaction(() => {
    sessions.forEach((session) => {
      insertStatement.run(
        session.sourceType,
        session.sourceKey,
        session.dateKey,
        session.repoPath,
        session.branch,
        session.startTime,
        session.endTime,
        session.durationMs,
        session.trackedLocAdded,
        session.trackedLocDeleted,
        session.untrackedLocAdded,
        session.untrackedLocDeleted,
        session.totalLocAdded,
        session.totalLocDeleted,
        JSON.stringify(session.trackedLocByFileType),
        JSON.stringify(session.untrackedLocByFileType),
        JSON.stringify(session.locByFileType)
      );
      const changeCount = changesStatement.get().changes;
      if (changeCount === 1) {
        counts.importedSessions += 1;
      } else {
        counts.ignoredExistingSessions += 1;
      }
    });

    database.setMeta('legacy_import_source', sourceDir);
    database.setMeta('legacy_import_completed_at', new Date().toISOString());
  })();

  database.close();

  return {
    sourceDir,
    targetDir,
    databasePath,
    scannedFiles: summary.scannedFiles,
    importedSessions: counts.importedSessions,
    skippedSessions: summary.skippedSessions,
    ignoredExistingSessions: counts.ignoredExistingSessions,
    failedFiles: summary.failedFiles
  };
}

module.exports = {
  migrateLegacyStorageData
};
