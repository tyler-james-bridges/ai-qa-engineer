const { execFileSync } = require('child_process');
const { makeEvidence, sourceError } = require('./common');

function git(args, cwd) {
  return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: process.env.LANG,
      LC_ALL: process.env.LC_ALL,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
    },
  }).trim();
}

async function collectGit(check, context) {
  try {
    const head = git(['rev-parse', 'HEAD'], context.repoPath);
    const branch = git(['branch', '--show-current'], context.repoPath) || null;
    const status = git(['status', '--porcelain'], context.repoPath);
    const matches = head.toLowerCase() === context.contract.revision.toLowerCase();
    const dirty = Boolean(status);
    const passed = matches && !dirty;

    return makeEvidence(check, 'git.local', {
      source: 'git',
      locator: `git:${head}`,
      observedAt: context.now.toISOString(),
      subject: { repository: context.repoPath, revision: head },
      status: passed ? 'pass' : 'fail',
      expected: { revision: context.contract.revision, dirty: false },
      observed: { revision: head, dirty },
      reason: passed
        ? `Local HEAD matches target revision ${head} and the worktree is clean.`
        : !matches
          ? `Local HEAD ${head} does not match target revision ${context.contract.revision}.`
          : 'Local worktree has uncommitted changes and does not exactly match the target revision.',
      facts: { head, branch, dirty },
    });
  } catch (error) {
    return sourceError(
      check,
      'git.local',
      `Could not inspect Git repository: ${error.message}`,
      null,
      {
        code: 'GIT_ERROR',
        humanAction: 'Verify --repo points to an accessible Git worktree.',
      },
    );
  }
}

module.exports = collectGit;
