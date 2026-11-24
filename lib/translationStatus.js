const TRANSLATION_EMPTY = 'TRANSLATION_EMPTY';
const TRANSLATION_PARTIAL = 'TRANSLATION_PARTIAL';

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
