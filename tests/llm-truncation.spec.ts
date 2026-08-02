import { test, expect } from '@playwright/test';

// Regression guards for the "AI ran out of output tokens" family of bugs.
//
// Both the 情緒翻譯 batch and the AI 改寫 preview force their answer into a single
// tool_use JSON object. When generation stops at max_tokens the partial JSON is
// unparseable, so the API hands back an empty `input` — and both parsers used to
// degrade to "no translations" / "three empty strings" with no error at all.
// That is exactly what a user saw as 情緒翻譯 rendering nothing on a thread of
// long comments, and as three blank rewrite cards on a long draft.
//
// These run against the provider's pure helpers, so they need no API key.
/* eslint-disable @typescript-eslint/no-require-imports */
const provider = require('../services/llm/claudeProvider.js');

const truncatedResponse = (toolName: string) => ({
  stop_reason: 'max_tokens',
  content: [{ type: 'tool_use', name: toolName, input: {} }],
});

test.describe('thread translation batching', () => {
  test('splits targets into batches that fit the output budget', () => {
    const refs = Array.from({ length: 13 }, (_, i) => i + 1);
    expect(provider.chunkTargets(refs, 6)).toEqual([
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12],
      [13],
    ]);
    expect(provider.chunkTargets([], 6)).toEqual([]);
    // The default must stay small enough that one batch cannot overrun.
    expect(provider.TRANSLATION_CHUNK_SIZE).toBeLessThanOrEqual(6);
  });

  test('reports truncation instead of silently returning nothing', () => {
    const refToId = new Map([[1, 'msg-1'], [2, 'msg-2']]);
    const parsed = provider.parseTranslationResponse(
      truncatedResponse('emit_thread_translations'),
      refToId
    );
    expect(parsed.translations).toEqual([]);
    // The whole point: an empty batch must be distinguishable from a normal one.
    expect(parsed.truncated).toBe(true);
  });

  test('maps short refs back to real message ids on a good response', () => {
    const refToId = new Map([[1, 'msg-1'], [2, 'msg-2']]);
    const parsed = provider.parseTranslationResponse(
      {
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use',
          name: 'emit_thread_translations',
          input: {
            translations: [
              { ref: 2, need: '被陪伴', rewrite: '我很想你', emotions: [{ label: '孤單', intensity: 70 }] },
              // Unknown ref and blank rewrite are both unusable — dropped.
              { ref: 99, need: 'x', rewrite: 'y' },
              { ref: 1, need: '被理解', rewrite: '   ' },
            ],
          },
        }],
      },
      refToId
    );
    expect(parsed.truncated).toBe(false);
    expect(parsed.translations).toEqual([
      { id: 'msg-2', emotions: [{ label: '孤單', intensity: 70 }], need: '被陪伴', rewrite: '我很想你' },
    ]);
  });
});

test.describe('reply rewrite', () => {
  test('flags a truncated rewrite rather than returning blank versions', () => {
    const parsed = provider.parseRewriteResponse(truncatedResponse('emit_reply_rewrite'));
    expect(parsed.truncated).toBe(true);
    expect(parsed.blank).toEqual(['neutral', 'firm', 'warm']);
  });

  test('flags a partially blank rewrite', () => {
    const parsed = provider.parseRewriteResponse({
      stop_reason: 'tool_use',
      content: [{
        type: 'tool_use',
        name: 'emit_reply_rewrite',
        input: { versions: { neutral: '中性版', firm: '', warm: '善意版' }, toxicityFlags: [] },
      }],
    });
    expect(parsed.truncated).toBe(false);
    // A blank version is never a usable answer, truncation or not.
    expect(parsed.blank).toEqual(['firm']);
  });

  test('passes a complete rewrite through', () => {
    const parsed = provider.parseRewriteResponse({
      stop_reason: 'tool_use',
      content: [{
        type: 'tool_use',
        name: 'emit_reply_rewrite',
        input: { versions: { neutral: '中性版', firm: '堅定版', warm: '善意版' }, toxicityFlags: [] },
      }],
    });
    expect(parsed.blank).toEqual([]);
    expect(parsed.versions).toEqual({ neutral: '中性版', firm: '堅定版', warm: '善意版' });
  });
});

test.describe('translation result envelope', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { translationStatus } = require('../lib/translationStatus.js');

  test('a fully cached thread is not a failure', () => {
    expect(translationStatus(0, 0)).toEqual({ requested: 0, translated: 0, partial: false });
  });

  test('an empty batch carries its own code and a next step', () => {
    const status = translationStatus(5, 0);
    expect(status.error_code).toBe('TRANSLATION_EMPTY');
    expect(status.partial).toBe(true);
    // Must tell the user what to do, not just that something failed.
    expect(status.message).toContain('重試');
  });

  test('a partial batch is reported separately from an empty one', () => {
    const status = translationStatus(5, 2);
    expect(status.error_code).toBe('TRANSLATION_PARTIAL');
    expect(status.message).toContain('2 / 5');
  });
});
