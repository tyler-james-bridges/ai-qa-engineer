const fs = require('fs');
const path = require('path');
const { loadClaim, loadContract } = require('./contract');
const { collect } = require('./collectors');
const { evaluate } = require('./evaluate');
const { VerificationInputError, VerificationRuntimeError } = require('./errors');
const { buildReport, formatHuman } = require('./report');

const EXIT_CODES = {
  pass: 0,
  fail: 1,
  needs_human_review: 2,
  verifier_error: 3,
};

async function verify(options = {}) {
  const startedAt = (options.now || new Date()).toISOString();
  const loadedContract = loadContract(options.contractPath);
  const loadedClaim = loadClaim(options.claimPath, options.input);
  const repoPath = path.resolve(options.repoPath || process.cwd());
  assertRepoPath(repoPath);

  const contractDir = path.dirname(loadedContract.path);
  const context = {
    contract: loadedContract.contract,
    contractDir,
    claim: loadedClaim.claim,
    claimHash: loadedClaim.hash,
    claimSource: loadedClaim.source,
    now: options.now || new Date(),
    repoPath,
  };
  const evidenceByCriterion = new Map();

  for (const criterion of loadedContract.contract.criteria) {
    const evidence = [];
    for (let index = 0; index < criterion.checks.length; index++) {
      const check = {
        ...criterion.checks[index],
        id: criterion.checks[index].id || `${criterion.id}-CHECK-${index + 1}`,
      };
      evidence.push(await collect(check, context));
    }
    evidenceByCriterion.set(criterion.id, evidence);
  }

  const evaluation = evaluate(loadedContract.contract, evidenceByCriterion);
  const completedAt = (options.now || new Date()).toISOString();
  const report = buildReport({
    contract: loadedContract.contract,
    contractHash: loadedContract.hash,
    contractPath: loadedContract.path,
    claim: loadedClaim.claim,
    claimHash: loadedClaim.hash,
    claimSource: loadedClaim.source,
    completedAt,
    evaluation,
    repoPath,
    startedAt,
  });

  if (options.outPath) writeReport(options.outPath, report, options.json);
  return { report, exitCode: EXIT_CODES[report.verdict] };
}

function assertRepoPath(repoPath) {
  let stat;
  try {
    stat = fs.statSync(repoPath);
  } catch (error) {
    throw new VerificationInputError(`Repository path is inaccessible: ${repoPath}.`);
  }
  if (!stat.isDirectory()) {
    throw new VerificationInputError(`Repository path is not a directory: ${repoPath}.`);
  }
}

function writeReport(outPath, report, json) {
  const absolutePath = path.resolve(outPath);
  const content = json ? JSON.stringify(report, null, 2) : formatHuman(report);
  try {
    fs.writeFileSync(absolutePath, content + '\n', { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new VerificationInputError(`Refusing to overwrite existing report: ${absolutePath}.`);
    }
    throw new VerificationRuntimeError(
      `Could not write report to ${absolutePath}: ${error.message}`,
      error,
    );
  }
}

module.exports = {
  EXIT_CODES,
  formatHuman,
  verify,
};
