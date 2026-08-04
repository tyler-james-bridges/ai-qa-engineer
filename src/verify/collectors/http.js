const { getJsonPath, deepEqual } = require('../utils');
const { makeEvidence, requireRecordedEvidence, validateFixtureMetadata } = require('./common');

async function collectHttpRevision(check, context) {
  const loaded = requireRecordedEvidence(check, context.contractDir, 'http.revision');
  const metadata = validateFixtureMetadata(check, loaded, 'http.revision', context.now);
  if (metadata.status === 'needs_human_review') return metadata;

  const response = metadata.payload;
  const unknowns = [];
  const contradictions = [];
  if (response.accessible === false || response.error) {
    unknowns.push(response.error?.message || 'Live revision endpoint is inaccessible.');
  }
  if (!response.url) unknowns.push('Observed response URL is missing.');
  else if (response.url !== check.url) contradictions.push(`response URL is ${response.url}`);
  if (!Number.isInteger(response.status)) unknowns.push('HTTP status is missing.');
  else if (response.status < 200 || response.status >= 300) {
    contradictions.push(`HTTP status is ${response.status}`);
  }

  let liveRevision;
  if (check.header) {
    const headers = Object.fromEntries(
      Object.entries(response.headers || {}).map(([key, value]) => [key.toLowerCase(), value]),
    );
    liveRevision = headers[check.header.toLowerCase()];
  } else {
    liveRevision = getJsonPath(response.body, check.jsonPath || '$.git_sha');
  }
  if (liveRevision === undefined || liveRevision === null || liveRevision === '') {
    unknowns.push('Live revision marker is missing.');
  } else if (
    check.equalsRevision !== false &&
    String(liveRevision).toLowerCase() !== context.contract.revision.toLowerCase()
  ) {
    contradictions.push(`live revision is ${liveRevision}`);
  }

  const status =
    contradictions.length > 0 ? 'fail' : unknowns.length > 0 ? 'needs_human_review' : 'pass';
  return makeEvidence(check, 'http.revision', {
    source: response.source || 'http',
    locator: response.locator || check.url,
    observedAt: metadata.observedAt,
    freshUntil: metadata.freshUntil,
    subject: { revision: liveRevision || null, url: response.url || null },
    status,
    expected: context.contract.revision,
    observed: liveRevision ?? response,
    reason:
      status === 'pass'
        ? `Live revision marker matches target revision ${context.contract.revision}.`
        : [...contradictions, ...unknowns].join('; ') + '.',
    facts: { httpStatus: response.status ?? null },
    limitations: unknowns,
    humanAction:
      status === 'needs_human_review'
        ? 'Expose or inspect an authoritative live revision marker, then verify again.'
        : null,
    artifactDigest: loaded.digest,
  });
}

async function collectHttpProbe(check, context) {
  const loaded = requireRecordedEvidence(check, context.contractDir, 'http.probe');
  const metadata = validateFixtureMetadata(check, loaded, 'http.probe', context.now);
  if (metadata.status === 'needs_human_review') return metadata;

  const response = metadata.payload;
  const expectedStatus = check.status ?? 200;
  const unknowns = [];
  const contradictions = [];
  if (response.accessible === false || response.error) {
    unknowns.push(response.error?.message || 'Feature probe is inaccessible.');
  }
  if (!response.url) unknowns.push('Observed probe URL is missing.');
  else if (response.url !== check.url) contradictions.push(`probe URL is ${response.url}`);
  if (!response.environment) unknowns.push('Observed probe environment is missing.');
  else if (response.environment !== check.environment) {
    contradictions.push(`probe environment is ${response.environment}`);
  }
  if (!Number.isInteger(response.status)) unknowns.push('HTTP status is missing.');
  else if (response.status !== expectedStatus)
    contradictions.push(`HTTP status is ${response.status}`);

  let observedValue = null;
  if (check.jsonPath) {
    observedValue = getJsonPath(response.body, check.jsonPath);
    if (observedValue === undefined) unknowns.push(`No value found at ${check.jsonPath}`);
    else if (!deepEqual(observedValue, check.equals)) {
      contradictions.push(`probe value at ${check.jsonPath} does not match expected value`);
    }
  }

  const status =
    contradictions.length > 0 ? 'fail' : unknowns.length > 0 ? 'needs_human_review' : 'pass';
  return makeEvidence(check, 'http.probe', {
    source: response.source || 'http',
    locator: response.locator || check.url,
    observedAt: metadata.observedAt,
    freshUntil: metadata.freshUntil,
    subject: { url: response.url || null, environment: response.environment || null },
    status,
    expected: { environment: check.environment, status: expectedStatus, value: check.equals },
    observed: { status: response.status ?? null, value: observedValue },
    reason:
      status === 'pass'
        ? 'The read-only feature probe satisfied its deterministic assertions.'
        : [...contradictions, ...unknowns].join('; ') + '.',
    limitations: unknowns,
    humanAction:
      status === 'needs_human_review'
        ? 'Inspect the feature in the target environment and collect a deterministic probe result.'
        : null,
    artifactDigest: loaded.digest,
  });
}

module.exports = {
  collectHttpProbe,
  collectHttpRevision,
};
