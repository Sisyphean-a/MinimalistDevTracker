const HOUR_MS = 60 * 60 * 1000;

function parseProjectKey(projectKey) {
  const [repoPath, branch] = String(projectKey).split('||');
  return {
    repoPath: repoPath || projectKey,
    branch: branch || 'unknown'
  };
}

function normalizeProject(projectKey, project) {
  const keyParts = parseProjectKey(projectKey);
  return {
    repoPath: project?.repoPath ?? keyParts.repoPath,
    branch: project?.branch ?? keyParts.branch,
    totalActiveTimeMs: project?.totalActiveTimeMs ?? 0,
    trackedLocAdded: project?.trackedLocAdded ?? project?.totalLocAdded ?? 0,
    trackedLocDeleted: project?.trackedLocDeleted ?? project?.totalLocDeleted ?? 0,
    untrackedLocAdded: project?.untrackedLocAdded ?? 0,
    untrackedLocDeleted: project?.untrackedLocDeleted ?? 0,
    totalLocAdded: project?.totalLocAdded ?? 0,
    totalLocDeleted: project?.totalLocDeleted ?? 0,
    locByFileType: project?.locByFileType ?? {},
    sessions: Array.isArray(project?.sessions) ? project.sessions : []
  };
}

function toProjectList(projects) {
  return Object.entries(projects ?? {})
    .map(([projectKey, project]) => normalizeProject(projectKey, project))
    .filter((project) => {
      return (project.totalLocAdded + project.totalLocDeleted) > 0
        || project.sessions.some((session) => ((session.locAdded ?? 0) + (session.locDeleted ?? 0)) > 0);
    });
}

function mergeByFileType(output, locByFileType) {
  Object.entries(locByFileType ?? {}).forEach(([fileType, metrics]) => {
    const existing = output[fileType] ?? { locAdded: 0, locDeleted: 0 };
    output[fileType] = {
      locAdded: existing.locAdded + (metrics.locAdded ?? 0),
      locDeleted: existing.locDeleted + (metrics.locDeleted ?? 0)
    };
  });
}

function aggregateSummary(projects) {
  return projects.reduce((acc, project) => {
    return {
      totalActiveTimeMs: acc.totalActiveTimeMs + project.totalActiveTimeMs,
      trackedLocAdded: acc.trackedLocAdded + project.trackedLocAdded,
      trackedLocDeleted: acc.trackedLocDeleted + project.trackedLocDeleted,
      untrackedLocAdded: acc.untrackedLocAdded + project.untrackedLocAdded,
      untrackedLocDeleted: acc.untrackedLocDeleted + project.untrackedLocDeleted,
      totalLocAdded: acc.totalLocAdded + project.totalLocAdded,
      totalLocDeleted: acc.totalLocDeleted + project.totalLocDeleted,
      sessionCount: acc.sessionCount + project.sessions.length
    };
  }, {
    totalActiveTimeMs: 0,
    trackedLocAdded: 0,
    trackedLocDeleted: 0,
    untrackedLocAdded: 0,
    untrackedLocDeleted: 0,
    totalLocAdded: 0,
    totalLocDeleted: 0,
    sessionCount: 0
  });
}

function aggregateByFileType(projects) {
  const output = {};
  projects.forEach((project) => {
    mergeByFileType(output, project.locByFileType);
  });
  return output;
}

function getActiveDays(days) {
  if (!Array.isArray(days)) {
    return [];
  }
  return days
    .filter((day) => ((day.totalActiveTimeMs ?? 0) > 0) || ((day.totalLoc ?? ((day.totalLocAdded ?? 0) + (day.totalLocDeleted ?? 0))) > 0))
    .sort((left, right) => right.date.localeCompare(left.date));
}

function flattenSessions(projects) {
  const output = [];
  projects.forEach((project) => {
    project.sessions.forEach((session) => {
      output.push({
        repoPath: project.repoPath,
        branch: session.branch ?? project.branch,
        startTime: session.startTime,
        endTime: session.endTime,
        durationMs: session.durationMs ?? 0,
        trackedLocAdded: session.trackedLocAdded ?? session.locAdded ?? 0,
        trackedLocDeleted: session.trackedLocDeleted ?? session.locDeleted ?? 0,
        untrackedLocAdded: session.untrackedLocAdded ?? 0,
        untrackedLocDeleted: session.untrackedLocDeleted ?? 0,
        locAdded: session.locAdded ?? 0,
        locDeleted: session.locDeleted ?? 0
      });
    });
  });
  return output.sort((left, right) => (right.endTime ?? 0) - (left.endTime ?? 0));
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map((value) => Number(value));
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function buildHourlyBuckets(projects, dateRangeStart, dateRangeEnd) {
  if (!dateRangeStart || !dateRangeEnd) {
    return [];
  }

  const rangeStart = parseDateKey(dateRangeStart).getTime();
  const rangeEnd = parseDateKey(dateRangeEnd).getTime() + (24 * HOUR_MS);
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) {
    return [];
  }

  const bucketCount = Math.round((rangeEnd - rangeStart) / HOUR_MS);
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    startTime: rangeStart + (index * HOUR_MS),
    endTime: rangeStart + ((index + 1) * HOUR_MS),
    totalActiveTimeMs: 0
  }));

  flattenSessions(projects).forEach((session) => {
    const rawStart = Number(session.startTime);
    const rawEnd = Number(session.endTime);
    const totalDurationMs = Math.max(0, Number(session.durationMs) || 0);
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
      return;
    }

    const sessionStart = Math.max(rangeStart, rawStart);
    const sessionEnd = Math.min(rangeEnd, rawEnd);
    if (sessionEnd <= sessionStart) {
      return;
    }

    const elapsedMs = Math.max(0, rawEnd - rawStart);
    if (elapsedMs === 0) {
      const bucketIndex = Math.floor((sessionStart - rangeStart) / HOUR_MS);
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].totalActiveTimeMs += totalDurationMs;
      }
      return;
    }

    const activityRatio = totalDurationMs / elapsedMs;
    let cursor = sessionStart;
    while (cursor < sessionEnd) {
      const bucketIndex = Math.floor((cursor - rangeStart) / HOUR_MS);
      if (bucketIndex < 0 || bucketIndex >= buckets.length) {
        break;
      }
      const bucket = buckets[bucketIndex];
      const overlapEnd = Math.min(sessionEnd, bucket.endTime);
      const overlapMs = overlapEnd - cursor;
      if (overlapMs > 0) {
        bucket.totalActiveTimeMs += overlapMs * activityRatio;
      }
      cursor = bucket.endTime;
    }
  });

  return buckets;
}

module.exports = {
  aggregateByFileType,
  aggregateSummary,
  buildHourlyBuckets,
  flattenSessions,
  getActiveDays,
  toProjectList
};
