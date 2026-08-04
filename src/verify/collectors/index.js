const collectClaimCoverage = require('./claim');
const collectDeployment = require('./deployment');
const collectGit = require('./git');
const { collectHttpProbe, collectHttpRevision } = require('./http');
const collectProviderModel = require('./model');
const collectPlaceholder = require('./placeholder');
const collectSchedulerRun = require('./scheduler');
const collectWorkflow = require('./workflow');

const COLLECTORS = {
  'claim.coverage': collectClaimCoverage,
  'data.placeholder': collectPlaceholder,
  'git.local': collectGit,
  'github.deployment': collectDeployment,
  'github.workflow': collectWorkflow,
  'http.probe': collectHttpProbe,
  'http.revision': collectHttpRevision,
  'provider.model': collectProviderModel,
  'scheduler.run': collectSchedulerRun,
};

async function collect(check, context) {
  return COLLECTORS[check.type](check, context);
}

module.exports = {
  COLLECTORS,
  collect,
};
