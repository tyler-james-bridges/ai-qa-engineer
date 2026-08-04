const { makeEvidence, requireRecordedEvidence, validateFixtureMetadata } = require('./common');

async function collectWorkflow(check, context) {
  const loaded = requireRecordedEvidence(check, context.contractDir, 'github.workflow');
  const metadata = validateFixtureMetadata(check, loaded, 'github.workflow', context.now);
  if (metadata.status === 'needs_human_review') return metadata;

  const run = metadata.payload;
  const expectedConclusion = check.conclusion || 'success';
  const expected = {
    workflow: check.workflow,
    headSha: context.contract.revision,
    status: 'completed',
    conclusion: expectedConclusion,
    minTests: check.minTests,
  };
  const contradictions = [];
  const unknowns = [];

  if (run.accessible === false || run.error) {
    unknowns.push(run.error?.message || 'Workflow evidence is inaccessible.');
  }
  if (!run.workflow) unknowns.push('Workflow identity is missing.');
  else if (run.workflow !== check.workflow) contradictions.push(`workflow is ${run.workflow}`);
  if (run.runId === undefined || run.runId === null || run.runId === '') {
    unknowns.push('Immutable workflow run ID is missing.');
  }
  if (!Number.isInteger(run.attempt) || run.attempt < 1) {
    unknowns.push('Workflow attempt is missing or invalid.');
  }
  if (!run.locator) unknowns.push('Immutable workflow locator is missing.');
  if (!run.headSha) unknowns.push('Workflow head SHA is missing.');
  else if (run.headSha.toLowerCase() !== context.contract.revision.toLowerCase()) {
    contradictions.push(`workflow ran on ${run.headSha}`);
  }
  if (!run.status) unknowns.push('Workflow status is missing.');
  else if (run.status !== 'completed') unknowns.push(`workflow status is ${run.status}`);
  if (run.status === 'completed') {
    if (!run.conclusion) unknowns.push('Workflow conclusion is missing.');
    else if (run.conclusion !== expectedConclusion) {
      contradictions.push(`workflow conclusion is ${run.conclusion}`);
    }
  }
  if (check.minTests !== undefined) {
    if (!Number.isInteger(run.testsExecuted)) unknowns.push('Executed test count is missing.');
    else if (run.testsExecuted < check.minTests) {
      contradictions.push(`only ${run.testsExecuted} tests executed; ${check.minTests} required`);
    }
  }

  const status =
    contradictions.length > 0 ? 'fail' : unknowns.length > 0 ? 'needs_human_review' : 'pass';
  const reason =
    status === 'pass'
      ? `Workflow ${check.workflow} completed successfully for the target revision.`
      : [...contradictions, ...unknowns].join('; ') + '.';

  return makeEvidence(check, 'github.workflow', {
    source: run.source || 'github',
    locator: run.locator || loaded.absolutePath,
    observedAt: metadata.observedAt,
    freshUntil: metadata.freshUntil,
    subject: { revision: run.headSha || null, workflow: run.workflow || null },
    status,
    expected,
    observed: run,
    reason,
    facts: {
      runId: run.runId || null,
      attempt: run.attempt || null,
      testsExecuted: run.testsExecuted ?? null,
    },
    limitations: unknowns,
    humanAction:
      status === 'needs_human_review'
        ? 'Inspect or rerun the required workflow for the exact target revision.'
        : null,
    artifactDigest: loaded.digest,
  });
}

module.exports = collectWorkflow;
