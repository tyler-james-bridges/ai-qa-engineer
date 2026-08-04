const { makeEvidence, requireRecordedEvidence, validateFixtureMetadata } = require('./common');
const { parseTimestamp } = require('../utils');

async function collectSchedulerRun(check, context) {
  const loaded = requireRecordedEvidence(check, context.contractDir, 'scheduler.run');
  const metadata = validateFixtureMetadata(check, loaded, 'scheduler.run', context.now);
  if (metadata.status === 'needs_human_review') return metadata;

  const job = metadata.payload;
  const dueAt = Date.parse(check.dueAt);
  const contradictions = [];
  const unknowns = [];

  if (job.accessible === false || job.error) {
    unknowns.push(job.error?.message || 'Scheduler state is inaccessible.');
  } else {
    if (job.enabled === false) contradictions.push('schedule is disabled');
    else if (job.enabled !== true) unknowns.push('schedule enabled state is missing');
    if (!job.schedule) unknowns.push('Observed schedule is missing');
    else if (job.schedule !== check.schedule) {
      contradictions.push(`schedule is ${job.schedule}`);
    }
    if (!job.timezone) unknowns.push('Observed schedule timezone is missing');
    else if (job.timezone !== check.timezone) {
      contradictions.push(`schedule timezone is ${job.timezone}`);
    }

    if (context.now.getTime() < dueAt) {
      unknowns.push(`run is not due until ${check.dueAt}`);
    } else if (!job.invocationId) {
      contradictions.push(`no invocation exists for run due at ${check.dueAt}`);
    } else {
      const invocationDueAt = parseTimestamp(job.dueAt);
      if (invocationDueAt === null) unknowns.push('Invocation dueAt identity is missing');
      else if (invocationDueAt !== dueAt) {
        contradictions.push(`invocation is for ${job.dueAt}, not ${check.dueAt}`);
      }
      if (!job.revision) unknowns.push('Invocation revision is missing');
      else if (job.revision.toLowerCase() !== context.contract.revision.toLowerCase()) {
        contradictions.push(`invocation ran revision ${job.revision}`);
      }
      if (!job.environment) unknowns.push('Invocation environment is missing');
      else if (job.environment !== check.environment) {
        contradictions.push(`invocation environment is ${job.environment}`);
      }
      if (!job.status || ['queued', 'running', 'in_progress'].includes(job.status)) {
        unknowns.push(`due invocation is ${job.status || 'missing a status'}`);
      } else if (job.status !== 'success') {
        contradictions.push(`due invocation status is ${job.status}`);
      }
    }

    if (check.requirePostcondition === true && job.status === 'success') {
      if (job.postcondition === false)
        contradictions.push('business postcondition was not observed');
      else if (job.postcondition !== true)
        unknowns.push('business postcondition evidence is missing');
      const postconditionAt = parseTimestamp(job.postconditionObservedAt);
      if (postconditionAt === null) {
        unknowns.push('business postcondition observation time is missing');
      } else if (postconditionAt < dueAt) {
        contradictions.push('business postcondition predates the due invocation');
      }
    }
  }

  const status =
    contradictions.length > 0 ? 'fail' : unknowns.length > 0 ? 'needs_human_review' : 'pass';
  return makeEvidence(check, 'scheduler.run', {
    source: job.source || 'scheduler',
    locator: job.locator || loaded.absolutePath,
    observedAt: metadata.observedAt,
    freshUntil: metadata.freshUntil,
    subject: {
      schedule: job.schedule || null,
      timezone: job.timezone || null,
      dueAt: job.dueAt || null,
      revision: job.revision || null,
      environment: job.environment || null,
    },
    status,
    expected: {
      dueAt: check.dueAt,
      revision: context.contract.revision,
      environment: check.environment,
      status: 'success',
      postcondition: true,
    },
    observed: job,
    reason:
      status === 'pass'
        ? `Scheduled run due at ${check.dueAt} completed with its postcondition.`
        : [...contradictions, ...unknowns].join('; ') + '.',
    limitations: unknowns,
    humanAction:
      status === 'needs_human_review'
        ? 'Inspect the next due invocation and its business heartbeat/postcondition.'
        : null,
    artifactDigest: loaded.digest,
  });
}

module.exports = collectSchedulerRun;
