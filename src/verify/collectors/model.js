const { makeEvidence, requireRecordedEvidence, validateFixtureMetadata } = require('./common');

async function collectProviderModel(check, context) {
  const loaded = requireRecordedEvidence(check, context.contractDir, 'provider.model');
  const metadata = validateFixtureMetadata(check, loaded, 'provider.model', context.now);
  if (metadata.status === 'needs_human_review') return metadata;

  const result = metadata.payload;
  const contradictions = [];
  const unknowns = [];
  if (result.accessible === false || result.error) {
    unknowns.push(result.error?.message || 'Provider model state is inaccessible.');
  }
  if (!result.provider) unknowns.push('Observed provider identity is missing.');
  else if (result.provider !== check.provider) {
    contradictions.push(`provider is ${result.provider}`);
  }
  if (!result.model) unknowns.push('Observed model identity is missing.');
  else if (result.model !== check.model) {
    contradictions.push(`model is ${result.model}`);
  }
  if (!result.route) unknowns.push('Observed subagent route is missing.');
  else if (result.route !== check.route) {
    contradictions.push(`smoke test used route ${result.route}`);
  }
  if (!result.locator) unknowns.push('Immutable provider observation locator is missing.');
  if (result.catalogVisible !== true) {
    if (result.catalogVisible === false)
      contradictions.push('model is not visible to the credential');
    else unknowns.push('provider catalog result is missing');
  }
  if (result.smokeStatus !== 'success') {
    if (['rejected', 'failed'].includes(result.smokeStatus)) {
      contradictions.push(`actual subagent route ${result.smokeStatus}`);
    } else {
      unknowns.push('actual subagent route was not smoke-tested');
    }
  }

  const status =
    contradictions.length > 0 ? 'fail' : unknowns.length > 0 ? 'needs_human_review' : 'pass';
  return makeEvidence(check, 'provider.model', {
    source: result.source || check.provider,
    locator: result.locator || loaded.absolutePath,
    observedAt: metadata.observedAt,
    freshUntil: metadata.freshUntil,
    subject: {
      provider: result.provider || null,
      model: result.model || null,
      route: result.route || null,
    },
    status,
    expected: { provider: check.provider, model: check.model, smokeStatus: 'success' },
    observed: result,
    reason:
      status === 'pass'
        ? `Model ${check.model} is available and the actual subagent route started successfully.`
        : [...contradictions, ...unknowns].join('; ') + '.',
    limitations: unknowns,
    humanAction:
      status === 'needs_human_review'
        ? 'Validate the model with the actual credential and smoke the configured subagent route.'
        : null,
    artifactDigest: loaded.digest,
  });
}

module.exports = collectProviderModel;
