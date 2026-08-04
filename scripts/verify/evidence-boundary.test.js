const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { resolveEvidencePath } = require('../../src/verify/collectors/common');
const { VerificationInputError } = require('../../src/verify/errors');

test('recorded evidence paths cannot escape the reviewed contract directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qai-evidence-root-'));
  try {
    assert.equal(
      resolveEvidencePath(dir, 'evidence.json'),
      path.join(fs.realpathSync(dir), 'evidence.json'),
    );
    assert.throws(
      () => resolveEvidencePath(dir, '../secret.json'),
      (error) => error instanceof VerificationInputError,
    );
    assert.throws(
      () => resolveEvidencePath(dir, '/etc/passwd'),
      (error) => error instanceof VerificationInputError,
    );

    const outside = path.join(path.dirname(dir), `${path.basename(dir)}-outside.json`);
    const link = path.join(dir, 'linked.json');
    fs.writeFileSync(outside, '{}\n');
    fs.symlinkSync(outside, link);
    try {
      assert.throws(
        () => resolveEvidencePath(dir, 'linked.json'),
        (error) => error instanceof VerificationInputError,
      );
    } finally {
      fs.rmSync(outside, { force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
