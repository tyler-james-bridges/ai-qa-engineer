const fs = require('fs');
const path = require('path');
const { VerificationInputError } = require('./errors');
const { isFullSha, isPlainObject, parseDuration, parseTimestamp, sha256 } = require('./utils');

const CONTRACT_KEYS = new Set(['schemaVersion', 'task', 'revision', 'criteria']);
const CRITERION_KEYS = new Set(['id', 'text', 'required', 'checks']);
const COMMON_CHECK_KEYS = new Set(['id', 'type', 'evidence', 'maxAge']);

const CHECK_KEYS = {
  'git.local': [],
  'github.workflow': ['workflow', 'conclusion', 'minTests'],
  'github.deployment': ['environment', 'state'],
  'http.revision': ['url', 'jsonPath', 'header', 'equalsRevision'],
  'http.probe': ['url', 'status', 'jsonPath', 'equals', 'environment'],
  'scheduler.run': ['schedule', 'timezone', 'dueAt', 'requirePostcondition', 'environment'],
  'claim.coverage': ['criterionIds'],
  'provider.model': ['provider', 'model', 'route'],
  'data.placeholder': ['sentinels', 'requireProvenance', 'environment'],
};

function readJsonFile(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new VerificationInputError(`Could not read ${label} at ${filePath}: ${error.message}`);
  }

  try {
    return { value: JSON.parse(raw), raw };
  } catch (error) {
    throw new VerificationInputError(`${label} is not valid JSON: ${error.message}`);
  }
}

function loadContract(contractPath) {
  const absolutePath = path.resolve(contractPath);
  const { value, raw } = readJsonFile(absolutePath, 'verification contract');
  validateContract(value);
  return {
    contract: value,
    path: absolutePath,
    hash: sha256(raw),
  };
}

function loadClaim(claimPath, input = process.stdin) {
  if (!claimPath) {
    throw new VerificationInputError('Missing --claim <file|->.');
  }

  if (claimPath === '-') {
    const claim = fs.readFileSync(input.fd, 'utf8');
    if (!claim.trim()) throw new VerificationInputError('Completion claim from stdin is empty.');
    return { claim, source: 'stdin', hash: sha256(claim) };
  }

  const absolutePath = path.resolve(claimPath);
  let claim;
  try {
    claim = fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    throw new VerificationInputError(
      `Could not read completion claim at ${absolutePath}: ${error.message}`,
    );
  }
  if (!claim.trim()) throw new VerificationInputError('Completion claim is empty.');
  return { claim, source: absolutePath, hash: sha256(claim) };
}

function validateContract(contract) {
  const errors = [];
  if (!isPlainObject(contract)) {
    throw new VerificationInputError('Verification contract must be a JSON object.');
  }

  checkUnknownKeys(contract, CONTRACT_KEYS, 'contract', errors);
  if (contract.schemaVersion !== '1') errors.push('schemaVersion must be "1".');
  if (typeof contract.task !== 'string' || !contract.task.trim()) {
    errors.push('task must be a non-empty string.');
  }
  if (!isFullSha(contract.revision)) {
    errors.push('revision must be a full 40-character Git SHA.');
  }
  if (!Array.isArray(contract.criteria) || contract.criteria.length === 0) {
    errors.push('criteria must contain at least one required criterion.');
  } else {
    validateCriteria(contract.criteria, errors);
  }

  if (errors.length > 0) {
    throw new VerificationInputError('Invalid verification contract.', errors);
  }
}

function validateCriteria(criteria, errors) {
  const ids = new Set();
  let requiredCount = 0;

  criteria.forEach((criterion, index) => {
    const label = `criteria[${index}]`;
    if (!isPlainObject(criterion)) {
      errors.push(`${label} must be an object.`);
      return;
    }

    checkUnknownKeys(criterion, CRITERION_KEYS, label, errors);
    if (typeof criterion.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(criterion.id)) {
      errors.push(`${label}.id must be a stable alphanumeric identifier.`);
    } else if (ids.has(criterion.id)) {
      errors.push(`Duplicate criterion id: ${criterion.id}.`);
    } else {
      ids.add(criterion.id);
    }
    if (typeof criterion.text !== 'string' || !criterion.text.trim()) {
      errors.push(`${label}.text must be a non-empty string.`);
    }
    if (criterion.required !== true) {
      errors.push(`${label}.required must be true in schema version 1.`);
    } else {
      requiredCount += 1;
    }
    if (!Array.isArray(criterion.checks) || criterion.checks.length === 0) {
      errors.push(`${label}.checks must contain at least one supported check.`);
    } else {
      criterion.checks.forEach((check, checkIndex) => {
        validateCheck(check, `${label}.checks[${checkIndex}]`, errors);
      });
      const independentChecks = criterion.checks.filter((check) => check.type !== 'claim.coverage');
      if (independentChecks.length === 0) {
        errors.push(`${label}.checks must include at least one independent evidence check.`);
      }
    }
  });

  if (requiredCount === 0) errors.push('At least one criterion must be required.');
}

function validateCheck(check, label, errors) {
  if (!isPlainObject(check)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(CHECK_KEYS, check.type)) {
    errors.push(`${label}.type is unsupported: ${String(check.type)}.`);
    return;
  }

  const allowed = new Set([...COMMON_CHECK_KEYS, ...CHECK_KEYS[check.type]]);
  checkUnknownKeys(check, allowed, label, errors);

  if (check.id !== undefined && (typeof check.id !== 'string' || !check.id.trim())) {
    errors.push(`${label}.id must be a non-empty string when supplied.`);
  }
  if (check.evidence !== undefined && (typeof check.evidence !== 'string' || !check.evidence)) {
    errors.push(`${label}.evidence must be a non-empty fixture path when supplied.`);
  }
  if (check.maxAge !== undefined && parseDuration(check.maxAge) === null) {
    errors.push(`${label}.maxAge must use an integer followed by s, m, h, or d.`);
  }

  validateTypedCheck(check, label, errors);
}

function validateTypedCheck(check, label, errors) {
  const stringFields = {
    'github.workflow': ['workflow'],
    'github.deployment': ['environment'],
    'http.revision': ['url'],
    'http.probe': ['url', 'environment'],
    'scheduler.run': ['schedule', 'timezone', 'dueAt', 'environment'],
    'provider.model': ['provider', 'model', 'route'],
    'data.placeholder': ['environment'],
  };

  for (const field of stringFields[check.type] || []) {
    if (typeof check[field] !== 'string' || !check[field].trim()) {
      errors.push(`${label}.${field} must be a non-empty string.`);
    }
  }

  if (check.type === 'scheduler.run' && parseTimestamp(check.dueAt) === null) {
    errors.push(`${label}.dueAt must be an ISO-8601 timestamp.`);
  }
  if (check.type === 'claim.coverage') {
    if (
      !Array.isArray(check.criterionIds) ||
      check.criterionIds.length === 0 ||
      check.criterionIds.some((id) => typeof id !== 'string' || !id.trim())
    ) {
      errors.push(`${label}.criterionIds must be a non-empty string array.`);
    } else if (new Set(check.criterionIds).size !== check.criterionIds.length) {
      errors.push(`${label}.criterionIds must not contain duplicates.`);
    }
  }
  if (check.type === 'data.placeholder') {
    if (
      !Array.isArray(check.sentinels) ||
      check.sentinels.length === 0 ||
      check.sentinels.some((sentinel) => typeof sentinel !== 'string' || !sentinel)
    ) {
      errors.push(`${label}.sentinels must be a non-empty string array.`);
    } else if (new Set(check.sentinels).size !== check.sentinels.length) {
      errors.push(`${label}.sentinels must not contain duplicates.`);
    }
  }
  if (check.type === 'http.revision') {
    if (!check.jsonPath && !check.header) {
      errors.push(`${label} must supply jsonPath or header.`);
    }
    if (check.jsonPath !== undefined && (typeof check.jsonPath !== 'string' || !check.jsonPath)) {
      errors.push(`${label}.jsonPath must be a non-empty string when supplied.`);
    }
    if (check.header !== undefined && (typeof check.header !== 'string' || !check.header.trim())) {
      errors.push(`${label}.header must be a non-empty string when supplied.`);
    }
    if (check.equalsRevision !== undefined && typeof check.equalsRevision !== 'boolean') {
      errors.push(`${label}.equalsRevision must be a boolean when supplied.`);
    }
    if (check.jsonPath && check.header) {
      errors.push(`${label} must use either jsonPath or header, not both.`);
    }
  }
  if (check.type === 'http.probe') {
    if (!Number.isInteger(check.status) || check.status < 100 || check.status > 599) {
      errors.push(`${label}.status must be an integer from 100 through 599.`);
    }
    if (typeof check.jsonPath !== 'string' || !check.jsonPath) {
      errors.push(`${label}.jsonPath must be a non-empty string.`);
    }
    if (!Object.prototype.hasOwnProperty.call(check, 'equals')) {
      errors.push(`${label}.equals must be supplied.`);
    }
  }
  if (['http.revision', 'http.probe'].includes(check.type)) {
    try {
      const url = new URL(check.url);
      if (!['https:', 'http:'].includes(url.protocol)) {
        errors.push(`${label}.url must use http or https.`);
      }
    } catch {
      errors.push(`${label}.url must be an absolute http(s) URL.`);
    }
  }
  if (check.type === 'github.workflow') {
    const invalidMinTests =
      !Number.isInteger(check.minTests) || check.minTests < 1;
    if (invalidMinTests) errors.push(`${label}.minTests must be a positive integer.`);
    if (check.conclusion !== undefined && (typeof check.conclusion !== 'string' || !check.conclusion)) {
      errors.push(`${label}.conclusion must be a non-empty string when supplied.`);
    }
  }
  if (check.type === 'github.deployment') {
    if (check.state !== undefined && (typeof check.state !== 'string' || !check.state)) {
      errors.push(`${label}.state must be a non-empty string when supplied.`);
    }
  }
  if (check.type === 'scheduler.run' && check.requirePostcondition !== true) {
    errors.push(`${label}.requirePostcondition must be true in schema version 1.`);
  }
  if (check.type === 'data.placeholder' && check.requireProvenance !== true) {
    errors.push(`${label}.requireProvenance must be true in schema version 1.`);
  }
}

function checkUnknownKeys(value, allowed, label, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label} contains unknown field: ${key}.`);
  }
}

module.exports = {
  CHECK_KEYS,
  loadClaim,
  loadContract,
  readJsonFile,
  validateContract,
};
