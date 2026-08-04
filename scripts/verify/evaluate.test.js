const assert = require('node:assert/strict');
const test = require('node:test');
const { aggregateCriterionStatus, aggregateStatus, evaluate } = require('../../src/verify/evaluate');

test('aggregates fail over review over pass', () => {
  assert.equal(aggregateStatus([{ status: 'pass' }]), 'pass');
  assert.equal(
    aggregateStatus([{ status: 'pass' }, { status: 'needs_human_review' }]),
    'needs_human_review',
  );
  assert.equal(aggregateStatus([{ status: 'needs_human_review' }, { status: 'fail' }]), 'fail');
});

test('claim coverage cannot be sole evidence but can gate otherwise independent support', () => {
  const independent = { collector: 'git.local', status: 'pass' };
  assert.equal(
    aggregateCriterionStatus([
      independent,
      { collector: 'claim.coverage', status: 'pass' },
    ]),
    'pass',
  );
  assert.equal(
    aggregateCriterionStatus([
      independent,
      { collector: 'claim.coverage', status: 'needs_human_review' },
    ]),
    'needs_human_review',
  );
});

test('keeps every criterion visible when one fails', () => {
  const contract = {
    criteria: [
      { id: 'AC-1', text: 'one', required: true },
      { id: 'AC-2', text: 'two', required: true },
    ],
  };
  const evidence = new Map([
    ['AC-1', [{ status: 'fail', reason: 'contradicted' }]],
    [
      'AC-2',
      [
        {
          status: 'needs_human_review',
          reason: 'missing',
          humanAction: 'inspect it',
        },
      ],
    ],
  ]);
  const result = evaluate(contract, evidence);
  assert.equal(result.verdict, 'fail');
  assert.equal(result.criteria.length, 2);
  assert.deepEqual(result.counts, { pass: 0, fail: 1, needsHumanReview: 1 });
  assert.deepEqual(result.reasonCodes, ['FAIL:AC-1', 'NEEDS_HUMAN_REVIEW:AC-2']);
});

test('empty evidence requires review rather than passing', () => {
  const contract = { criteria: [{ id: 'AC-1', text: 'one', required: true }] };
  const result = evaluate(contract, new Map());
  assert.equal(result.verdict, 'needs_human_review');
  assert.match(result.criteria[0].reason, /No supported independent evidence/);
});
