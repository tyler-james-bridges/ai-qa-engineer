const SENSITIVE_KEY =
  /(authorization|api[-_]?key|password|secret|token|cookie|credential|private[-_]?key)/i;
const TOKEN_PATTERNS = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?:eyJ[A-Za-z0-9_-]{8,})\.(?:[A-Za-z0-9_-]{8,})\.(?:[A-Za-z0-9_-]{8,})\b/g,
  /\bBearer\s+[^\s,;]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

function redactString(value) {
  let redacted = value;

  for (const pattern of TOKEN_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }

  redacted = redacted.replace(
    /\b(api[-_]?key|password|secret|token|client[_-]?credentials?|private[_-]?key)\s*[:=]\s*/gi,
    '$1=',
  );
  redacted = redacted.replace(
    /\b(api[-_]?key|password|secret|token|client[_-]?credentials?|private[_-]?key)=([^\s,;]+)/gi,
    '$1=[REDACTED]',
  );
  redacted = redacted.replace(
    /([?&](?:access_token|api_key|key|token)=)[^&#\s]+/gi,
    '$1[REDACTED]',
  );
  redacted = redacted.replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[REDACTED]@');

  return redacted;
}

function redact(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]),
  );
}

module.exports = {
  redact,
  redactString,
};
