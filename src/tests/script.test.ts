import { describe, it, expect } from 'vitest';
import {
  parseScript,
  resolveGenderNicknames,
  scriptHasUnresolvedGenderTokens,
  detectScriptSpeakers,
  applySpeakerAssignments,
} from '../utils/script';

const COUPLE = {
  partner1: '馬克',
  partner2: '小美',
  partner1Gender: 'male',
  partner2Gender: 'female',
};

describe('resolveGenderNicknames', () => {
  it('maps male/female nicknames when current user is male', () => {
    expect(resolveGenderNicknames(COUPLE)).toEqual({ male: '馬克', female: '小美' });
  });

  it('maps male/female nicknames when current user is female', () => {
    expect(
      resolveGenderNicknames({
        partner1: '小美',
        partner2: '馬克',
        partner1Gender: 'female',
        partner2Gender: 'male',
      })
    ).toEqual({ male: '馬克', female: '小美' });
  });

  it('returns empty when a gender is missing or the couple is same-gender', () => {
    expect(resolveGenderNicknames({ partner1: 'a', partner2: 'b' })).toEqual({});
    expect(
      resolveGenderNicknames({ partner1: 'a', partner2: 'b', partner1Gender: 'male' })
    ).toEqual({});
    expect(
      resolveGenderNicknames({
        partner1: 'a',
        partner2: 'b',
        partner1Gender: 'male',
        partner2Gender: 'male',
      })
    ).toEqual({});
  });
});

describe('parseScript', () => {
  it('replaces gender tokens with the gender-matching partner nickname', () => {
    const out = parseScript('[男]: 今晚想吃什麼？\n[女]: 你決定就好', COUPLE);
    expect(out).toBe('馬克: "今晚想吃什麼？"\n\n小美: "你決定就好"');
  });

  it('handles [他]/[她] and full-width colons', () => {
    const out = parseScript('[他]：走吧\n[她]：好呀', COUPLE);
    expect(out).toBe('馬克: "走吧"\n\n小美: "好呀"');
  });

  it('keeps [partner1]/[partner2] viewer-relative regardless of gender', () => {
    const femaleViewer = {
      partner1: '小美',
      partner2: '馬克',
      partner1Gender: 'female',
      partner2Gender: 'male',
    };
    const out = parseScript('[partner1]: 嗨\n[partner2]: 哈囉', femaleViewer);
    expect(out).toBe('小美: "嗨"\n\n馬克: "哈囉"');
  });

  it('leaves gender tokens visible when genders are not resolvable', () => {
    const out = parseScript('[男]: 嗨\n[女]: 哈囉', { partner1: 'a', partner2: 'b' });
    expect(out).toContain('[男]');
    expect(out).toContain('[女]');
  });

  it('is idempotent — re-parsing already-formatted dialogue does not double-wrap quotes', () => {
    const once = parseScript('[男]: 嗨\n[女]: 哈囉', COUPLE);
    const twice = parseScript(once, COUPLE);
    expect(twice).toBe(once);
  });

  it('keeps dialogue containing extra colons intact', () => {
    const out = parseScript('[男]: 他說：好', COUPLE);
    expect(out).toBe('馬克: "他說：好"');
  });

  it('does not treat parenthesized stage directions as dialogue', () => {
    const out = parseScript('（場景：教室）\n[男]: 上課了', COUPLE);
    expect(out.split('\n\n')[0]).toBe('（場景：教室）');
  });
});

describe('scriptHasUnresolvedGenderTokens', () => {
  it('detects remaining gender tokens', () => {
    expect(scriptHasUnresolvedGenderTokens('[男]: hi')).toBe(true);
    expect(scriptHasUnresolvedGenderTokens('[她]: hi')).toBe(true);
    expect(scriptHasUnresolvedGenderTokens('馬克: hi\n[partner1]: yo')).toBe(false);
  });
});

describe('detectScriptSpeakers', () => {
  it('lists distinct speakers in order of first appearance', () => {
    const content = '小明：早安\n小芳：早～\n小明：吃了嗎？\n（場景：教室）';
    expect(detectScriptSpeakers(content)).toEqual(['小明', '小芳']);
  });

  it('ignores placeholder-token lines', () => {
    expect(detectScriptSpeakers('[男]: hi\n小芳: yo')).toEqual(['小芳']);
  });
});

describe('applySpeakerAssignments', () => {
  it('rewrites assigned speakers to gender tokens, leaving others as written', () => {
    const content = '小明：早安\n小芳：早～\n老師：上課！';
    const out = applySpeakerAssignments(content, { 小明: 'male', 小芳: 'female' });
    expect(out).toBe('[男]：早安\n[女]：早～\n老師：上課！');
  });

  it('does not touch mentions of the name inside dialogue', () => {
    const out = applySpeakerAssignments('小明：小芳你好嗎？', { 小明: 'male' });
    expect(out).toBe('[男]：小芳你好嗎？');
  });

  it('end-to-end: assigned script parses into gender-matched nicknames', () => {
    const assigned = applySpeakerAssignments('小明：早安\n小芳：早～', {
      小明: 'male',
      小芳: 'female',
    });
    expect(parseScript(assigned, COUPLE)).toBe('馬克: "早安"\n\n小美: "早～"');
  });
});
