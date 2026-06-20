// Pluggable LLM service for the events × icebreaker feature.
// Provider is chosen via the LLM_PROVIDER env var. Defaults to "mock".
// To add a real provider (e.g. Claude), drop a `<name>Provider.js` file
// under services/llm/ that exports the same `generateIcebreaker` shape.

const { logWarn } = require('../lib/logger');

const PROVIDER_NAME = process.env.LLM_PROVIDER || 'mock';

let provider;
try {
  provider = require(`./llm/${PROVIDER_NAME}Provider`);
} catch (err) {
  logWarn('LLM provider not found; falling back to mock', { provider: PROVIDER_NAME, err: err.message });
  provider = require('./llm/mockProvider');
}

module.exports = {
  generateIcebreaker: provider.generateIcebreaker,
  rewriteReply: provider.rewriteReply,
  generateRoleplayMessages: provider.generateRoleplayMessages,
  providerName: PROVIDER_NAME,
};
