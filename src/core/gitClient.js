const { execFile } = require('node:child_process');

const DEFAULT_GIT_TIMEOUT_MS = 3_000;

function buildGitEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    LANG: 'C',
    LC_ALL: 'C'
  };
}

function createGitClient(options = {}) {
  const execFileFn = options.execFileFn ?? execFile;
  const timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
  const baseEnv = options.env ?? process.env;

  function run(args) {
    return new Promise((resolve, reject) => {
      execFileFn('git', args, { timeout: timeoutMs, env: buildGitEnv(baseEnv) }, (error, stdout, stderr) => {
        if (error) {
          const wrapped = new Error(`git ${args.join(' ')} failed: ${error.message}`);
          wrapped.cause = error;
          wrapped.stderr = stderr;
          reject(wrapped);
          return;
        }
        resolve(stdout);
      });
    });
  }

  return Object.freeze({
    run
  });
}

module.exports = {
  buildGitEnv,
  createGitClient,
  DEFAULT_GIT_TIMEOUT_MS
};
