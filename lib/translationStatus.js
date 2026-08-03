// Shared result envelope for the 情緒翻譯 endpoints (events + wall).
//
// The batched LLM call can come back empty or partial — most often because the
// model was cut off at max_tokens mid tool_use, which makes the whole JSON
// unparseable. That used to surface as a plain `200 {translations:{}}`, so the
// UI rendered nothing at all with no error and no explanation. Every response
// now carries how many translations were asked for versus produced, plus a
// specific error_code + message whenever the user is owed an explanation.

const TRANSLATION_EMPTY = 'TRANSLATION_EMPTY';
const TRANSLATION_PARTIAL = 'TRANSLATION_PARTIAL';

// requested: messages sent to the model this request (already-cached ones are
// excluded). translated: how many came back usable and were persisted.
function translationStatus(requested, translated) {
  const base = { requested, translated, partial: translated < requested };
  if (requested === 0 || translated >= requested) return { ...base, partial: false };

  if (translated === 0) {
    return {
      ...base,
      error_code: TRANSLATION_EMPTY,
      message: '這串對話比較長，AI 這次沒能完成情緒翻譯（沒有扣用今日額度）。請按「重試」，通常再試一次就會成功。',
    };
  }
  return {
    ...base,
    error_code: TRANSLATION_PARTIAL,
    message: `已完成 ${translated} / ${requested} 則，較長的留言這次沒翻完。按「重試」可補齊其餘幾則。`,
  };
}

module.exports = { translationStatus, TRANSLATION_EMPTY, TRANSLATION_PARTIAL };
