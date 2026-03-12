const path = require('node:path');

const WATCH_PATTERN = '**/*';
const DOT_GIT_SEGMENT = '/.git/';

function toPosixPath(inputPath) {
  return inputPath.replace(/\\/g, '/');
}

function isGitInternalPath(fsPath) {
  const normalized = toPosixPath(fsPath).toLowerCase();
  return normalized.includes(DOT_GIT_SEGMENT) || normalized.endsWith('/.git');
}

function toRelativePath(root, fsPath) {
  const relativePath = path.relative(root, fsPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  return toPosixPath(relativePath);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(globPattern) {
  const normalized = toPosixPath(globPattern);
  const escaped = escapeRegExp(normalized)
    .replace(/\\\*\\\*/g, '::DOUBLE_STAR::')
    .replace(/\\\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function createGlobMatchers(excludeGlobs) {
  return excludeGlobs.map((glob) => globToRegExp(glob));
}

function isExcludedByGlob(fsPath, roots, excludeMatchers) {
  return roots.some((root) => {
    const relativePath = toRelativePath(root, fsPath);
    if (relativePath === null) {
      return false;
    }
    return excludeMatchers.some((matcher) => matcher.test(relativePath));
  });
}

function createFilterState(initialRoots, initialExcludeGlobs) {
  let roots = initialRoots.slice();
  let excludeMatchers = createGlobMatchers(initialExcludeGlobs);

  function update(nextRoots, nextExcludeGlobs) {
    roots = nextRoots.slice();
    excludeMatchers = createGlobMatchers(nextExcludeGlobs);
  }

  function shouldIgnore(fsPath) {
    return isGitInternalPath(fsPath) || isExcludedByGlob(fsPath, roots, excludeMatchers);
  }

  return Object.freeze({
    update,
    shouldIgnore
  });
}

function invokeActivity(onFileActivity, fsPath, reportError) {
  Promise.resolve()
    .then(() => onFileActivity(fsPath))
    .catch(reportError);
}

function createUriHandler(input) {
  return function handleUri(uri) {
    try {
      const fsPath = uri?.fsPath;
      if (!fsPath || input.shouldIgnore(fsPath)) {
        return;
      }
      invokeActivity(input.onFileActivity, fsPath, input.reportError);
    } catch (error) {
      input.reportError(error);
    }
  };
}

function createDisposablesForRoots(vscode, roots, handleUri) {
  const disposables = [];
  roots.forEach((root) => {
    const pattern = new vscode.RelativePattern(vscode.Uri.file(root), WATCH_PATTERN);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    disposables.push(watcher);
    disposables.push(watcher.onDidCreate(handleUri));
    disposables.push(watcher.onDidChange(handleUri));
    disposables.push(watcher.onDidDelete(handleUri));
  });
  return disposables;
}

function disposeAll(disposables) {
  disposables.forEach((item) => item.dispose());
}

function createFileActivityWatcher(options) {
  const reportError = (error) => options.logError('fileActivity', error);
  const state = createFilterState(options.roots, options.excludeGlobs ?? []);
  const handleUri = createUriHandler({
    onFileActivity: options.onFileActivity,
    shouldIgnore: state.shouldIgnore,
    reportError
  });
  let disposables = [];

  function rebuild(nextRoots, nextExcludeGlobs = []) {
    disposeAll(disposables);
    state.update(nextRoots, nextExcludeGlobs);
    disposables = createDisposablesForRoots(options.vscode, nextRoots, handleUri);
  }

  function dispose() {
    disposeAll(disposables);
    disposables = [];
  }

  rebuild(options.roots, options.excludeGlobs ?? []);
  return Object.freeze({ rebuild, dispose });
}

module.exports = {
  createFileActivityWatcher,
  globToRegExp,
  isGitInternalPath
};
