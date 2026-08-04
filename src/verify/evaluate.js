const { countStatuses } = require('./utils');

function aggregateStatus(items) {
  if (items.some((item) => item.status === 'fail')) return 'fail';
  if (items.some((item) => item.status === 'needs_human_review')) {
    return 'needs_human_review';
  }
  return 'pass';
}

function aggregateCriterionStatus(evidence) {
  const independent = evidence.filter((item) => item.collector !== 'claim.coverage');
  const claimCoverage = evidence.filter((item) => item.collector === 'claim.coverage');
  if (independent.some((item) => item.status === 'fail')) return 'fail';
  if (independent.length === 0) return 'needs_human_review';
  if (independent.some((item) => item.status === 'needs_human_review')) {
    return 'needs_human_review';
  }
  if (claimCoverage.some((item) => item.status === 'needs_human_review')) {
    return 'needs_human_review';
  }
  return 'pass';
}

function evaluateCriteria(contract, evidenceByCriterion) {
  return contract.criteria.map((criterion) => {
    const evidence = evidenceByCriterion.get(criterion.id) || [];
    const status = evidence.length === 0 ? 'needs_human_review' : aggregateCriterionStatus(evidence);
    const failing = evidence.filter((item) => item.status === 'fail');
    const unresolved = evidence.filter((item) => item.status === 'needs_human_review');
    let reason;
    let humanAction = null;

    if (status === 'fail') {
      reason = failing.map((item) => item.reason).join(' ');
    } else if (status === 'needs_human_review') {
      reason =
        unresolved
          .filter(
            (item) =>
              item.collector !== 'claim.coverage' ||
              (item.observed?.missing?.length || 0) > 0 ||
              (item.facts?.contradicted?.length || 0) > 0,
          )
          .map((item) => item.reason)
          .join(' ') || 'No supported independent evidence was collected for this criterion.';
      humanAction =
        unresolved
          .filter(
            (item) =>
              item.collector !== 'claim.coverage' ||
              (item.observed?.missing?.length || 0) > 0 ||
              (item.facts?.contradicted?.length || 0) > 0,
          )
          .map((item) => item.humanAction)
          .filter(Boolean)
          .join(' ') || 'Collect independent evidence for this criterion.';
    } else {
      const independentCount = evidence.filter((item) => item.collector !== 'claim.coverage').length;
      reason = `All ${independentCount} declared independent checks passed.`;
      humanAction = null;
    }

    return {
      id: criterion.id,
      text: criterion.text,
      required: criterion.required,
      status,
      expected: evidence.map((item) => ({ check: item.id, value: item.expected })),
      observed: evidence.map((item) => ({ check: item.id, value: item.observed })),
      reason,
      humanAction,
      evidence,
    };
  });
}

function evaluate(contract, evidenceByCriterion) {
  const criteria = evaluateCriteria(contract, evidenceByCriterion);
  const verdict = aggregateStatus(criteria);
  const counts = countStatuses(criteria);
  const reasonCodes = criteria
    .filter((criterion) => criterion.status !== 'pass')
    .map((criterion) => `${criterion.status.toUpperCase()}:${criterion.id}`);

  return { verdict, counts, criteria, reasonCodes };
}

module.exports = {
  aggregateCriterionStatus,
  aggregateStatus,
  evaluate,
  evaluateCriteria,
};
