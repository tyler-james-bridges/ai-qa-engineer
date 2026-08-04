const assert = require('node:assert/strict');
const test = require('node:test');
const { redact, redactString } = require('../../src/verify/redact');

test('redacts sensitive keys recursively without mutating structure', () => {
  const result = redact({ headers: { Authorization: 'Bearer abc' }, nested: [{ apiKey: 'key' }] });
  assert.equal(result.headers.Authorization, '[REDACTED]');
  assert.equal(result.nested[0].apiKey, '[REDACTED]');
});

test('redacts tokens, bearer credentials, URLs, and inline secrets', () => {
  const input =
    'token=supersecret Bearer abcdefghijklmnop https://u:p@example.test?a=1&api_key=secret';
  const result = redactString(input);
  assert.doesNotMatch(result, /supersecret|abcdefghijklmnop|u:p|api_key=secret/);
  assert.match(result, /\[REDACTED\]/);
});

test('redacts AWS IDs, JWTs, private keys, and credential assignments', () => {
  const input = [
    'AKIAIOSFODNN7EXAMPLE',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123',
    'client_credentials=do-not-print',
    '-----BEGIN PRIVATE KEY-----\nabcdef\n-----END PRIVATE KEY-----',
  ].join(' ');
  const result = redactString(input);
  assert.doesNotMatch(result, /AKIAIOS|eyJhbGci|do-not-print|abcdef/);
});
