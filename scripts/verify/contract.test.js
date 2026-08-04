const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { loadContract, validateContract } = require('../../src/verify/contract');
const { VerificationInputError } = require('../../src/verify/errors');
const { fixture, materializeContract, TARGET_SHA } = require('./test-helpers');

function validContract(overrides = {}) {
  return {
    schemaVersion: '1',
    task: 'Verify a task',
    revision: TARGET_SHA,
    criteria: [
      {
        id: 'AC-1',
        text: 'The criterion passes',
        required: true,
        checks: [
          { type: 'git.local' },
          { type: 'claim.coverage', criterionIds: ['AC-1'] },
        ],
      },
    ],
    ...overrides,
  };
}

test('accepts a strict version 1 contract', () => {
  assert.doesNotThrow(() => validateContract(validContract()));
});

test('rejects unknown fields, empty criteria, and short revisions', () => {
  assert.throws(
    () => validateContract(validContract({ revision: 'main', unexpected: true, criteria: [] })),
    (error) => {
      assert.ok(error instanceof VerificationInputError);
      assert.match(error.details.join('\n'), /unknown field: unexpected/);
      assert.match(error.details.join('\n'), /full 40-character Git SHA/);
      assert.match(error.details.join('\n'), /at least one required criterion/);
      return true;
    },
  );
});

test('rejects duplicate criterion IDs and unsupported checks', () => {
  const criterion = validContract().criteria[0];
  const contract = validContract({
    criteria: [
      criterion,
      { ...criterion, checks: [{ type: 'shell.arbitrary', command: 'rm -rf .' }] },
    ],
  });
  assert.throws(
    () => validateContract(contract),
    (error) => {
      assert.match(error.details.join('\n'), /Duplicate criterion id/);
      assert.match(error.details.join('\n'), /unsupported/);
      return true;
    },
  );
});

test('rejects optional criteria in schema version 1', () => {
  const contract = validContract();
  contract.criteria[0].required = false;
  assert.throws(() => validateContract(contract), /Invalid verification contract/);
});

test('loads a contract with a stable hash', () => {
  const materialized = materializeContract(
    fixture('stale-deploy', 'pass.contract.json'),
    TARGET_SHA,
  );
  try {
    const loaded = loadContract(materialized.contractPath);
    assert.equal(loaded.contract.schemaVersion, '1');
    assert.match(loaded.hash, /^[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(materialized.dir, { recursive: true, force: true });
  }
});

test('reports malformed JSON as an input error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qai-contract-'));
  const file = path.join(dir, 'bad.json');
  fs.writeFileSync(file, '{bad');
  try {
    assert.throws(() => loadContract(file), /not valid JSON/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects malformed typed check values', () => {
  const contract = validContract();
  contract.criteria[0].checks = [
    {
      type: 'github.workflow',
      workflow: 'test.yml',
      minTests: -1,
    },
    {
      type: 'http.probe',
      url: 'file:///etc/passwd',
    },
    {
      type: 'claim.coverage',
      criterionIds: ['AC-1', 42],
    },
  ];
  assert.throws(
    () => validateContract(contract),
    (error) => {
      const details = error.details.join('\n');
      assert.match(details, /minTests must be a positive integer/);
      assert.match(details, /url must use http or https/);
      assert.match(details, /criterionIds must be a non-empty string array/);
      return true;
    },
  );
});

test('claim coverage cannot be the sole evidence for a criterion', () => {
  const contract = validContract();
  contract.criteria[0].checks = [{ type: 'claim.coverage', criterionIds: ['AC-1'] }];
  assert.throws(
    () => validateContract(contract),
    (error) => {
      assert.match(error.details.join('\n'), /independent evidence check/);
      return true;
    },
  );
});
