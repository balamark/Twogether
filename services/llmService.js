// Pluggable LLM service for the events × icebreaker feature.
// Provider is chosen via the LLM_PROVIDER env var. Defaults to "mock".
// To add a real provider (e.g. Claude), drop a `<name>Provider.js` file
// under services/llm/ that exports the same `generateIcebreaker` shape.

const PROVIDER_NAME = process.env.LLM_PROVIDER || 'mock';

let provider;
try {
  provider = require(`./llm/${PROVIDER_NAME}Provider`);
} catch (err) {
  console.warn(`⚠️ LLM provider "${PROVIDER_NAME}" not found, falling back to mock. Error: ${err.message}`);
  provider = require('./llm/mockProvider');
}

module.exports = {
  generateIcebreaker: provider.generateIcebreaker,
  providerName: PROVIDER_NAME,
};
