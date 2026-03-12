const DEFAULT_DEBOUNCE_MS = 120_000;
const DIFF_ZERO = Object.freeze({ insertions: 0, deletions: 0 });

function createRepoState(startAt, baselineDiff) {
  return {
    status: 'ACTIVE',
    sessionStartMs: startAt,
    baselineDiff,
    timeoutHandle: null
  };
}

function createTimeTracker(options) {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const now = options.now;
  const getDiff = options.getDiff;
  const onSessionFinalized = options.onSessionFinalized;
  const states = new Map();

  async function readDiff(repoPath) {
    return (await Promise.resolve(getDiff(repoPath))) ?? DIFF_ZERO;
  }

  function scheduleTimeout(repoPath) {
    const state = states.get(repoPath);
    if (!state) {
      return;
    }
    clearTimeout(state.timeoutHandle);
    state.timeoutHandle = setTimeout(() => {
      void finalizeSession(repoPath, true);
    }, debounceMs);
  }

  async function ensureActive(repoPath) {
    const existing = states.get(repoPath);
    if (existing) {
      return existing;
    }
    const created = createRepoState(now(), await readDiff(repoPath));
    states.set(repoPath, created);
    return created;
  }

  function createSession(repoPath, state, endTime, endDiff, subtractDebounce) {
    const durationPenalty = subtractDebounce ? debounceMs : 0;
    return Object.freeze({
      repoPath,
      startTime: state.sessionStartMs,
      endTime,
      durationMs: Math.max(0, endTime - state.sessionStartMs - durationPenalty),
      locAdded: endDiff.insertions - state.baselineDiff.insertions,
      locDeleted: endDiff.deletions - state.baselineDiff.deletions
    });
  }

  async function finalizeSession(repoPath, subtractDebounce) {
    const state = states.get(repoPath);
    if (!state || state.status !== 'ACTIVE') {
      return null;
    }
    clearTimeout(state.timeoutHandle);
    const endTime = now();
    const endDiff = await readDiff(repoPath);
    const session = createSession(repoPath, state, endTime, endDiff, subtractDebounce);
    states.delete(repoPath);
    await Promise.resolve(onSessionFinalized(session));
    return session;
  }

  async function recordActivity(repoPath) {
    await ensureActive(repoPath);
    scheduleTimeout(repoPath);
  }

  async function handleCommit(repoPath) {
    const finalized = await finalizeSession(repoPath, false);
    if (!finalized) {
      return null;
    }
    const restarted = createRepoState(now(), await readDiff(repoPath));
    states.set(repoPath, restarted);
    scheduleTimeout(repoPath);
    return finalized;
  }

  async function flushAll() {
    const outputs = [];
    for (const repoPath of Array.from(states.keys())) {
      const session = await finalizeSession(repoPath, false);
      if (session) {
        outputs.push(session);
      }
    }
    return outputs;
  }

  return Object.freeze({
    recordActivity,
    handleCommit,
    flushAll
  });
}

module.exports = {
  createTimeTracker,
  DEFAULT_DEBOUNCE_MS,
  DIFF_ZERO
};
