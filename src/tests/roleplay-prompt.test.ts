import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Prompt-contract regression test for the AI roleplay invitation voice bug:
// a male sender received messages written from the script's female
// protagonist's perspective. The fix front-loads an imperative perspective
// directive into the user content — this test pins that contract without a
// live API call. (CommonJS backend module, hence createRequire.)
const require = createRequire(import.meta.url);
const { buildRoleplayUserContent } = require('../../services/llm/claudeProvider.js');

const SCRIPT = {
  title: '人妻家事代行',
  scenario: '32歲已婚的小香接下富豪阿凱的家事代行工作…',
  scriptBody: '小香：老闆好…\n阿凱：今天也麻煩你了。',
  category: 'bold',
};

describe('buildRoleplayUserContent — sender perspective directive', () => {
  it('male sender: directive demands the male role voice and forbids female self-reference', () => {
    const content = buildRoleplayUserContent({ ...SCRIPT, senderGender: 'male' });
    // The directive must lead the prompt, before any script content.
    expect(content.startsWith('傳送者性別：男性')).toBe(true);
    expect(content).toContain('男性角色的第一人稱');
    expect(content).toContain('不可以用女性角色自稱');
    expect(content).toContain(SCRIPT.title);
  });

  it('female sender: mirrored directive', () => {
    const content = buildRoleplayUserContent({ ...SCRIPT, senderGender: 'female' });
    expect(content.startsWith('傳送者性別：女性')).toBe(true);
    expect(content).toContain('女性角色的第一人稱');
    expect(content).toContain('不可以用男性角色自稱');
  });

  it('unset gender: neutral, no in-script self-identification', () => {
    for (const g of [null, undefined, 'other']) {
      const content = buildRoleplayUserContent({ ...SCRIPT, senderGender: g });
      expect(content.startsWith('傳送者性別：未指定')).toBe(true);
      expect(content).toContain('中性');
    }
  });

  it('script body and metadata still follow the directive', () => {
    const content = buildRoleplayUserContent({ ...SCRIPT, senderGender: 'male' });
    const directiveIdx = content.indexOf('傳送者性別');
    const bodyIdx = content.indexOf('劇本內容：');
    expect(directiveIdx).toBe(0);
    expect(bodyIdx).toBeGreaterThan(directiveIdx);
    expect(content).toContain(SCRIPT.scriptBody);
  });
});
