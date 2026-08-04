const { makeEvidence, requireRecordedEvidence, validateFixtureMetadata } = require('./common');

async function collectPlaceholder(check, context) {
  const loaded = requireRecordedEvidence(check, context.contractDir, 'data.placeholder');
  const metadata = validateFixtureMetadata(check, loaded, 'data.placeholder', context.now);
  if (metadata.status === 'needs_human_review') return metadata;

  const result = metadata.payload;
  const contradictions = [];
  const unknowns = [];
  let deterministicMatches = [];

  if (!Array.isArray(result.matchedSentinels)) {
    unknowns.push('sentinel scan result is missing');
  } else {
    deterministicMatches = result.matchedSentinels.filter((item) => check.sentinels.includes(item));
  }

  if (result.accessible === false || result.error) {
    unknowns.push(result.error?.message || 'Deployed data is inaccessible.');
  }
  if (!result.environment) unknowns.push('Observed data environment is missing');
  else if (result.environment !== check.environment) {
    contradictions.push(`evidence came from ${result.environment}`);
  }
  if (deterministicMatches.length > 0) {
    contradictions.push(`known placeholder sentinel found: ${deterministicMatches.join(', ')}`);
  }
  if (result.schemaValid === false) contradictions.push('deployed data violates schema assertions');
  else if (result.schemaValid === undefined) unknowns.push('schema assertion result is missing');
  if (check.requireProvenance === true) {
    if (result.provenanceValid === false) contradictions.push('data provenance is invalid');
    else if (result.provenanceValid !== true) unknowns.push('data provenance is unknown');
  }
  if (result.heuristicSuspicion === true && contradictions.length === 0) {
    unknowns.push('data looks suspicious but no deterministic ground truth is available');
  }

  const status =
    contradictions.length > 0 ? 'fail' : unknowns.length > 0 ? 'needs_human_review' : 'pass';
  return makeEvidence(check, 'data.placeholder', {
    source: result.source || 'deployed-data',
    locator: result.locator || loaded.absolutePath,
    observedAt: metadata.observedAt,
    freshUntil: metadata.freshUntil,
    subject: { environment: result.environment || null },
    status,
    expected: { noSentinels: check.sentinels, provenance: check.requireProvenance === true },
    observed: result,
    reason:
      status === 'pass'
        ? 'No deterministic placeholder or provenance violation was observed.'
        : [...contradictions, ...unknowns].join('; ') + '.',
    limitations: unknowns,
    humanAction:
      status === 'needs_human_review'
        ? 'Confirm the data source and content with a domain owner or authoritative lineage record.'
        : null,
    artifactDigest: loaded.digest,
  });
}

module.exports = collectPlaceholder;
