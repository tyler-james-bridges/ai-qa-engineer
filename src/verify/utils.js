const crypto = require('crypto');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const iso8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!iso8601.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function parseDuration(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string') return null;

  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return Number(match[1]) * multipliers[match[2]];
}

function isFullSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
}

function getJsonPath(value, jsonPath) {
  if (!jsonPath || jsonPath === '$') return value;
  if (typeof jsonPath !== 'string' || !jsonPath.startsWith('$.')) return undefined;

  const parts = jsonPath.slice(2).split('.');
  let current = value;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (!Object.prototype.hasOwnProperty.call(Object(current), part)) return undefined;
    current = current[part];
  }
  return current;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function claimIncludesId(claim, id) {
  const escaped = escapeRegExp(id);
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`);
  return pattern.test(claim);
}

function countStatuses(items) {
  return items.reduce(
    (counts, item) => {
      if (item.status === 'pass') counts.pass += 1;
      if (item.status === 'fail') counts.fail += 1;
      if (item.status === 'needs_human_review') counts.needsHumanReview += 1;
      return counts;
    },
    { pass: 0, fail: 0, needsHumanReview: 0 },
  );
}

module.exports = {
  claimIncludesId,
  countStatuses,
  deepEqual,
  getJsonPath,
  isFullSha,
  isPlainObject,
  parseDuration,
  parseTimestamp,
  sha256,
};
