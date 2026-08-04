const fs = require('fs');
const path = require('path');
const { VerificationInputError } = require('../errors');
const { isPlainObject, parseTimestamp, sha256 } = require('../utils');

function resolveEvidencePath(contractDir, evidencePath) {
  const root = fs.realpathSync(contractDir);
  const absolutePath = path.resolve(root, evidencePath);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new VerificationInputError(
      `Evidence fixture must stay inside the contract directory: ${evidencePath}.`,
    );
  }

  const existingParent = findExistingParent(path.dirname(absolutePath));
  const realParent = fs.realpathSync(existingParent);
  const parentRelative = path.relative(root, realParent);
  if (parentRelative.startsWith('..') || path.isAbsolute(parentRelative)) {
    throw new VerificationInputError(
      `Evidence fixture resolves outside the contract directory: ${evidencePath}.`,
    );
  }

  let resolvedPath;
  try {
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new VerificationInputError(
        `Evidence fixture must be a regular file, not a symlink: ${evidencePath}.`,
      );
    }
    resolvedPath = fs.realpathSync(absolutePath);
  } catch (error) {
    if (error instanceof VerificationInputError) throw error;
    if (error.code === 'ENOENT') return absolutePath;
    throw error;
  }
  const realRelative = path.relative(root, resolvedPath);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new VerificationInputError(
      `Evidence fixture resolves outside the contract directory: ${evidencePath}.`,
    );
  }
  return resolvedPath;
}

function findExistingParent(candidate) {
  let current = candidate;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function loadEvidence(check, contractDir) {
  if (!check.evidence) return null;
  let absolutePath;
  try {
    absolutePath = resolveEvidencePath(contractDir, check.evidence);
  } catch (error) {
    if (error instanceof VerificationInputError) throw error;
    return sourceError(check, 'fixture', `Could not resolve evidence path: ${error.message}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    return sourceError(check, 'fixture', `Could not read evidence: ${error.message}`, absolutePath);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    return sourceError(
      check,
      'fixture',
      `Evidence is not valid JSON: ${error.message}`,
      absolutePath,
    );
  }
  if (!isPlainObject(payload)) {
    return sourceError(check, 'fixture', 'Evidence must be a JSON object.', absolutePath);
  }

  return {
    payload,
    absolutePath,
    digest: sha256(raw),
  };
}

function requireRecordedEvidence(check, contractDir, collector) {
  const loaded = loadEvidence(check, contractDir);
  if (loaded) return loaded;
  throw new VerificationInputError(
    `${collector} requires a recorded evidence fixture in MVP. Add check.evidence.`,
  );
}

function makeEvidence(check, collector, details = {}) {
  const status = details.status || 'needs_human_review';
  return {
    id: check.id || `${collector}:${details.locator || 'observation'}`,
    checkType: check.type,
    collector,
    collectorVersion: '1',
    source: details.source || 'unknown',
    locator: details.locator || null,
    observedAt: details.observedAt || null,
    freshUntil: details.freshUntil || null,
    subject: details.subject || {},
    status,
    expected: details.expected ?? null,
    observed: details.observed ?? null,
    reason: details.reason || 'No reason supplied.',
    facts: details.facts || {},
    limitations: details.limitations || [],
    error: details.error || null,
    humanAction: status === 'needs_human_review' ? details.humanAction || null : null,
    artifactDigest: details.artifactDigest || null,
  };
}

function sourceError(check, collector, message, locator = null, details = {}) {
  return makeEvidence(check, collector, {
    source: details.source || collector,
    locator,
    observedAt: details.observedAt || new Date().toISOString(),
    status: 'needs_human_review',
    reason: message,
    error: { code: details.code || 'SOURCE_ERROR', message },
    limitations: [message],
    humanAction: details.humanAction || 'Restore evidence access and run verification again.',
  });
}

function validateFixtureMetadata(check, loaded, collector, now) {
  if (loaded.status === 'needs_human_review') return loaded;
  const payload = loaded.payload;
  const observedAt = payload.observedAt;
  const observedAtMs = parseTimestamp(observedAt);
  if (observedAtMs === null) {
    return sourceError(
      check,
      collector,
      'Evidence has no valid observedAt timestamp.',
      loaded.absolutePath,
      {
        code: 'MALFORMED_EVIDENCE',
      },
    );
  }
  if (observedAtMs > now.getTime()) {
    return sourceError(
      check,
      collector,
      `Evidence observedAt ${observedAt} is in the future.`,
      loaded.absolutePath,
      { code: 'FUTURE_EVIDENCE' },
    );
  }

  let freshUntil = payload.freshUntil || null;
  if (freshUntil !== null && parseTimestamp(freshUntil) === null) {
    return sourceError(
      check,
      collector,
      'Evidence has an invalid freshUntil timestamp.',
      loaded.absolutePath,
      { code: 'MALFORMED_EVIDENCE' },
    );
  }
  if (check.maxAge) {
    const amount = Number(check.maxAge.slice(0, -1));
    const unit = check.maxAge.slice(-1);
    const multiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
    const maxAgeFreshUntil = new Date(observedAtMs + amount * multiplier).toISOString();
    if (freshUntil === null || Date.parse(maxAgeFreshUntil) < Date.parse(freshUntil)) {
      freshUntil = maxAgeFreshUntil;
    }
  }
  if (freshUntil === null) {
    return makeEvidence(check, collector, {
      source: payload.source || collector,
      locator: payload.locator || loaded.absolutePath,
      observedAt,
      status: 'needs_human_review',
      observed: payload,
      reason: 'Evidence has no freshness bound.',
      artifactDigest: loaded.digest,
      limitations: ['Unbounded evidence cannot support a pass.'],
      humanAction: 'Add maxAge to the check or freshUntil to the recorded observation.',
    });
  }
  if (Date.parse(freshUntil) < observedAtMs) {
    return sourceError(
      check,
      collector,
      `Evidence freshUntil ${freshUntil} precedes observedAt ${observedAt}.`,
      loaded.absolutePath,
      { code: 'MALFORMED_EVIDENCE' },
    );
  }
  if (Date.parse(freshUntil) < now.getTime()) {
    return makeEvidence(check, collector, {
      source: payload.source || collector,
      locator: payload.locator || loaded.absolutePath,
      observedAt,
      freshUntil,
      status: 'needs_human_review',
      observed: payload,
      reason: `Evidence expired at ${freshUntil}.`,
      artifactDigest: loaded.digest,
      limitations: ['Stale evidence cannot support a pass.'],
      humanAction: 'Collect fresh evidence for this criterion.',
    });
  }

  return { payload, observedAt, freshUntil };
}

module.exports = {
  loadEvidence,
  makeEvidence,
  requireRecordedEvidence,
  resolveEvidencePath,
  sourceError,
  validateFixtureMetadata,
};
