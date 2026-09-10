import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Prompt-contract regression test for the AI counselor "one-sided analysis" bug:
// when only one partner has spoken (the other hasn't replied yet), the counselor
// must analyze ONLY the person who spoke and must never fabricate, translate, or
// speak for the silent partner's feelings. The fix appends a deterministic
// one-sided note to the counselor's user turn; this pins that contract without a
// live API call. (CommonJS backend module, hence createRequire.)
const require = createRequire(import.meta.url);
const { buildWallCounselorUserContent } = require('../../services/llm/claudeProvider.js');

const POST = {
  postContent: '昨晚我很累，早上送小孩上學，回家後伴侶只顧著工作，我覺得被忽略、很受傷。',
  postAuthorName: '馮迪索',
  moodTag: '疲憊、受傷',
};

describe('buildWallCounselorUserContent — one-sided thread', () => {
  it('no reply yet: appends the one-sided note focused on the lone speaker', () => {
    const content = buildWallCounselorUserContent({ ...POST, replies: [] });
    expect(content).toContain('【重要】');
    expect(content).toContain('只有 馮迪索 一個人在這串對話裡發聲');
    expect(content).toContain('絕對不要描述、猜測、翻譯或代言另一半');
    // The empty-reply placeholder still renders.
    expect(content).toContain('（目前還沒有任何回覆。）');
  });

  it('honors an explicit oneSided flag even when the lone speaker left messages', () => {
    // The initiator added their own follow-up message; the partner is still silent.
    const replies = [{ authorName: '馮迪索', content: '我還是很在意這件事。', isAi: false }];
    const content = buildWallCounselorUserContent({ ...POST, replies, oneSided: true });
    expect(content).toContain('【重要】');
    expect(content).toContain('只有 馮迪索 一個人在這串對話裡發聲');
  });

  it('an AI counselor reply does not count as the partner speaking', () => {
    const replies = [{ authorName: 'AI 諮商師', content: '我聽見你的疲憊。', isAi: true }];
    const content = buildWallCounselorUserContent({ ...POST, replies });
    expect(content).toContain('【重要】');
    expect(content).toContain('只有 馮迪索 一個人在這串對話裡發聲');
  });
});

describe('buildWallCounselorUserContent — two-sided thread', () => {
  it('both partners spoke: no one-sided note', () => {
    const replies = [{ authorName: '另一半', content: '我也很累，只是不知道怎麼講。', isAi: false }];
    const content = buildWallCounselorUserContent({ ...POST, replies });
    expect(content).not.toContain('【重要】');
    expect(content).toContain('另一半：我也很累');
  });

  it('explicit oneSided=false overrides a name-only count', () => {
    const content = buildWallCounselorUserContent({ ...POST, replies: [], oneSided: false });
    expect(content).not.toContain('【重要】');
  });
});
