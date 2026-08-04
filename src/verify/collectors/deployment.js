const { makeEvidence, requireRecordedEvidence, validateFixtureMetadata } = require('./common');

async function collectDeployment(check, context) {
  const loaded = requireRecordedEvidence(check, context.contractDir, 'github.deployment');
  const metadata = validateFixtureMetadata(check, loaded, 'github.deployment', context.now);
  if (metadata.status === 'needs_human_review') return metadata;

  const deployment = metadata.payload;
  const expectedState = check.state || 'success';
  const contradictions = [];
  const unknowns = [];

  if (deployment.accessible === false || deployment.error) {
    unknowns.push(deployment.error?.message || 'Deployment evidence is inaccessible.');
  }
  if (!deployment.environment) unknowns.push('Deployment environment is missing.');
  else if (deployment.environment !== check.environment) {
    contradictions.push(`deployment environment is ${deployment.environment}`);
  }
  if (deployment.deploymentId === undefined || deployment.deploymentId === null || deployment.deploymentId === '') {
    unknowns.push('Immutable deployment ID is missing.');
  }
  if (!deployment.locator) unknowns.push('Immutable deployment locator is missing.');
  if (!deployment.sha) unknowns.push('Deployment SHA is missing.');
  else if (deployment.sha.toLowerCase() !== context.contract.revision.toLowerCase()) {
    contradictions.push(`deployment SHA is ${deployment.sha}`);
  }
  if (!deployment.state) unknowns.push('Deployment state is missing.');
  else if (['queued', 'pending', 'in_progress'].includes(deployment.state)) {
    unknowns.push(`deployment is ${deployment.state}`);
  } else if (deployment.state !== expectedState) {
    contradictions.push(`deployment state is ${deployment.state}`);
  }

  const status =
    contradictions.length > 0 ? 'fail' : unknowns.length > 0 ? 'needs_human_review' : 'pass';
  return makeEvidence(check, 'github.deployment', {
    source: deployment.source || 'github',
    locator: deployment.locator || loaded.absolutePath,
    observedAt: metadata.observedAt,
    freshUntil: metadata.freshUntil,
    subject: {
      revision: deployment.sha || null,
      environment: deployment.environment || null,
    },
    status,
    expected: {
      revision: context.contract.revision,
      environment: check.environment,
      state: expectedState,
    },
    observed: deployment,
    reason:
      status === 'pass'
        ? `Deployment record reports target revision in ${check.environment}.`
        : [...contradictions, ...unknowns].join('; ') + '.',
    facts: { deploymentId: deployment.deploymentId || null },
    limitations: unknowns,
    humanAction:
      status === 'needs_human_review'
        ? `Inspect the latest ${check.environment} deployment and wait for a terminal state.`
        : null,
    artifactDigest: loaded.digest,
  });
}

module.exports = collectDeployment;
