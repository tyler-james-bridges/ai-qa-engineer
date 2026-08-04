const { makeEvidence } = require('./common');
const { claimIncludesId } = require('../utils');

async function collectClaimCoverage(check, context) {
  const missing = check.criterionIds.filter((id) => !claimIncludesId(context.claim, id));
  const contradicted = check.criterionIds.filter((id) => claimContradictsId(context.claim, id));
  const requiresReview = missing.length > 0 || contradicted.length > 0;

  return makeEvidence(check, 'claim.coverage', {
    source: 'completion-claim',
    locator: context.claimSource,
    observedAt: context.now.toISOString(),
    subject: { claimHash: context.claimHash },
    status: requiresReview ? 'needs_human_review' : 'pass',
    expected: check.criterionIds,
    observed: { addressed: check.criterionIds.filter((id) => !missing.includes(id)), missing },
    reason: missing.length > 0
      ? `The completion claim does not address: ${missing.join(', ')}.`
      : contradicted.length > 0
        ? `The completion claim contains adverse wording for: ${contradicted.join(', ')}.`
        : 'The completion claim names every required criterion; independent evidence controls pass.',
    facts: { contradicted },
    limitations: ['Claim coverage is not independent evidence that any criterion passed.'],
    humanAction: requiresReview
      ? `Review claim and evidence for: ${[...new Set([...missing, ...contradicted])].join(', ')}.`
      : 'No action; use independent evidence for the criterion verdict.',
  });
}

function claimContradictsId(claim, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = claim
    .split(/\r?\n|(?<=[.!?])\s+/)
    .find((segment) => new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`).test(segment));
  if (!line) return false;
  return /\b(fail(?:ed|s|ure)?|not\s+done|never\s+ran|did\s+not|incomplete|broken|error)\b/i.test(
    line,
  );
}

module.exports = collectClaimCoverage;
