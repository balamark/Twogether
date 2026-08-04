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
  generateWallCounselorComment: provider.generateWallCounselorComment,
  generateReconciliationOpeners: provider.generateReconciliationOpeners,
  generateEmotionAcceptance: provider.generateEmotionAcceptance,
  generateCheckupSummary: provider.generateCheckupSummary,
  generateStoryInsights: provider.generateStoryInsights,
  structureStory: provider.structureStory,
  parseScriptRoles: provider.parseScriptRoles,
  generateThreadTranslations: provider.generateThreadTranslations,
  generateTherapyNote: provider.generateTherapyNote,
  generateTherapySummary: provider.generateTherapySummary,
  generateCommunicationPatternSummary: provider.generateCommunicationPatternSummary,
  generateFacilitatorTurn: provider.generateFacilitatorTurn,
  generateClosureAssist: provider.generateClosureAssist,
  generateClosureInsight: provider.generateClosureInsight,
  analyzeDraft: provider.analyzeDraft,
  providerName: PROVIDER_NAME,
};
