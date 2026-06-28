// "接住情緒" guide — for each emotion the icebreaker can tag (see the fixed
// 21-emotion vocabulary in services/llm/claudeProvider.js), a short, static
// explanation of what the feeling is asking for plus a few ready-to-say lines
// the partner can use to RECEIVE it (validate first, not solve). No LLM cost.
//
// Used by the 衝突事件 analytics emotion chips (tap an emotion → see how to
// receive it) and reused by the logged-out preview example.

export interface EmotionAcceptanceGuide {
  /** What this feeling usually is / what it's really asking for. */
  meaning: string;
  /** How to receive it — the posture to take before solving anything. */
  howToReceive: string;
  /** A few validating things you can actually say. */
  sampleLines: string[];
}

export const EMOTION_ACCEPTANCE: Record<string, EmotionAcceptanceGuide> = {
  憤怒: {
    meaning: '憤怒底下常常是「我覺得不被尊重，或界線被踩到了」。它不是要攻擊你，是想被認真對待。',
    howToReceive: '先別急著解釋或反擊。承認對方的感受，讓他知道你聽見了，火氣會先降一半。',
    sampleLines: [
      '我聽到你很生氣，這件事對你來說真的很重要。',
      '你會這麼氣，一定是覺得很不被尊重，我想好好聽。',
      '我先停下來，不替自己辯解，我想先懂你。',
    ],
  },
  失落: {
    meaning: '失落是一種「期待落空」的低落。對方需要的不是被打氣，而是被陪著一起待在這個情緒裡。',
    howToReceive: '不要急著把他拉出來或叫他想開一點。陪著、承接，讓低落有地方落腳。',
    sampleLines: [
      '我感覺得到你很失落，你不用馬上好起來，我陪你。',
      '這種落空的感覺很難受，謝謝你願意讓我知道。',
      '我在這裡，你想說多少都可以。',
    ],
  },
  委屈: {
    meaning: '委屈是「我為這段關係付出，卻沒被看見」。最需要的是被肯定、被看見努力。',
    howToReceive: '先看見對方的付出與為難，不要先講「可是」。被理解，委屈才放得下。',
    sampleLines: [
      '你受委屈了，我有看見你的付出。',
      '對不起讓你覺得不被看見，這不是你應得的。',
      '你願意說出來我很謝謝你，我想更懂你的為難。',
    ],
  },
  失望: {
    meaning: '失望是「我本來相信會更好」。它其實藏著在乎——不在乎的人不會失望。',
    howToReceive: '承認落差，不要急著辯護自己。讓對方知道他的期待你放在心上。',
    sampleLines: [
      '我知道讓你失望了，這代表你其實很在乎我們。',
      '你的期待我聽見了，我想把它放在心上。',
      '謝謝你告訴我，而不是默默把我推遠。',
    ],
  },
  焦慮: {
    meaning: '焦慮是對未知與失控的不安。需要的是穩定感與「我們會一起面對」的保證。',
    howToReceive: '放慢、放穩。給保證、給陪伴，而不是急著解決或叫他別想太多。',
    sampleLines: [
      '你先慢慢呼吸，我在，我們一起面對。',
      '會擔心很正常，不管怎樣我都和你一起。',
      '不用一個人扛，有我在。',
    ],
  },
  孤單: {
    meaning: '孤單是「在關係裡卻覺得沒人懂我」。最需要的是被靠近、被在乎。',
    howToReceive: '主動靠近，讓對方真實感覺到你的存在與在意。',
    sampleLines: [
      '你不是一個人，我在你身邊。',
      '對不起讓你覺得孤單，我想更靠近你一點。',
      '我想多陪你，告訴我你需要什麼。',
    ],
  },
  疲憊: {
    meaning: '疲憊是「我撐很久了」。需要的是被允許休息、被體諒，而不是被要求再努力。',
    howToReceive: '先讓對方喘口氣，肯定他的辛苦，把「解決」往後放。',
    sampleLines: [
      '你辛苦了，先休息一下，事情等等再說。',
      '你撐很久了，我有看見，謝謝你。',
      '先照顧好你自己，剩下的我們一起想辦法。',
    ],
  },
  受傷: {
    meaning: '受傷是「我們之間發生的事讓我痛」。需要的是被溫柔對待，而不是被講道理。',
    howToReceive: '語氣放軟，先安撫情緒。一個輕柔的動作常勝過一千句解釋。',
    sampleLines: [
      '我知道我讓你受傷了，我很在意你的感受。',
      '你先別急，我在這裡，我們慢慢來。',
      '讓我抱你一下，不用說話也可以。',
    ],
  },
  恐懼: {
    meaning: '恐懼是面對威脅時的本能。需要的是安全感與「你不會一個人面對」的承諾。',
    howToReceive: '先給安全感，穩穩接住，不要否定他的害怕。',
    sampleLines: [
      '你會怕我懂，我會陪著你，不會讓你一個人。',
      '不管發生什麼，我都站在你這邊。',
      '你先靠著我，我們一步一步來。',
    ],
  },
  無助: {
    meaning: '無助是「我不知道該怎麼辦了」。需要的是有人和他站在一起，而不是被指點。',
    howToReceive: '別急著給建議。先讓對方知道他不孤單，再一起想。',
    sampleLines: [
      '我知道你現在很無助，我們一起想，不用你一個人扛。',
      '就算還沒有答案，我也會和你一起待在這裡。',
      '你不是沒用，是真的太難了，有我在。',
    ],
  },
  羞愧: {
    meaning: '羞愧是「我覺得自己不夠好」。最需要的是被接納——「就算這樣，你還是被愛的」。',
    howToReceive: '不要評價或追問，給接納與安全。讓對方知道他依然被珍惜。',
    sampleLines: [
      '不管怎樣你都還是我重視的人。',
      '會這樣覺得不代表你不好，我懂你的難。',
      '你願意跟我說，我覺得很珍貴。',
    ],
  },
  嫉妒: {
    meaning: '嫉妒底下常是「我怕失去你、怕自己不夠重要」。需要的是被肯定的安全感。',
    howToReceive: '不要嘲笑或防衛。先給保證，讓對方確定自己的位置。',
    sampleLines: [
      '你對我來說是特別的，這不會變。',
      '會在意是因為你重視我們，我懂。',
      '我想讓你更安心，告訴我怎麼做會比較好。',
    ],
  },
  煩躁: {
    meaning: '煩躁是情緒已經滿出來的訊號。需要的是空間與被體諒，而不是被追問。',
    howToReceive: '先給空間、降低刺激，不要在這時講道理或加碼。',
    sampleLines: [
      '你現在有點滿，我先不吵你，需要我時我都在。',
      '我們先暫停一下，等你比較舒服再聊。',
      '不急，先讓自己喘口氣。',
    ],
  },
  內疚: {
    meaning: '內疚是「我覺得自己做錯了、對不起你」。需要的是被原諒的空間，而不是被加重指責。',
    howToReceive: '先接住情緒，給台階。讓對方知道一次失誤不會否定他整個人。',
    sampleLines: [
      '你會自責代表你很在乎，這件事我們可以一起面對。',
      '人都會有做不好的時候，我沒有要怪你。',
      '謝謝你放在心上，我們往前看。',
    ],
  },
  被忽視: {
    meaning: '被忽視是「我好像不重要」。最需要的是被重新看見、被放回優先順位。',
    howToReceive: '承認對方的存在與需要，用行動讓他重新感覺被在乎。',
    sampleLines: [
      '對不起讓你覺得被忽略了，你對我很重要。',
      '我想多把注意力放在你身上，這是我的疏忽。',
      '謝謝你說出來，而不是默默忍著。',
    ],
  },
  不安: {
    meaning: '不安是對關係或未來的不確定。需要的是穩定的回應與一致的安全感。',
    howToReceive: '用穩定、清楚的態度回應，減少對方的猜測與懸著。',
    sampleLines: [
      '我在，我們之間是穩的，你可以放心。',
      '有什麼讓你不安的，我們攤開來說，我不會跑掉。',
      '謝謝你願意告訴我，我想讓你更安心。',
    ],
  },
  無奈: {
    meaning: '無奈是「試過了卻改變不了」的疲累與妥協。需要的是被理解這份為難。',
    howToReceive: '先承認處境的難，不要急著否定或催促。',
    sampleLines: [
      '我知道這真的很無奈，不是你不努力。',
      '這種無能為力的感覺很累，我懂。',
      '我們一起面對，不用你一個人消化。',
    ],
  },
  麻木: {
    meaning: '麻木常是情緒受傷太久後的自我保護。需要的是溫柔、不勉強的陪伴。',
    howToReceive: '不要逼對方有反應。安靜地在旁邊，讓他知道你還在。',
    sampleLines: [
      '你不用勉強有反應，我就在這裡。',
      '累到沒感覺的時候，我陪你慢慢來。',
      '不急，等你準備好，我都在。',
    ],
  },
  心累: {
    meaning: '心累是長期消耗下的疲乏。需要的是被體諒、被允許不必再用力。',
    howToReceive: '肯定對方的付出與疲倦，讓他可以暫時靠著你。',
    sampleLines: [
      '你心很累了，我有看見，先靠著我休息一下。',
      '這段時間真的辛苦你了。',
      '剩下的我們一起扛，你先喘口氣。',
    ],
  },
  難過: {
    meaning: '難過需要的，往往不是解法，而是有人願意陪著一起難過。',
    howToReceive: '先陪伴、先承接。別急著「讓他好起來」，先讓他被懂。',
    sampleLines: [
      '我知道你很難過，你可以哭，我陪著你。',
      '不用急著好起來，我就在這裡。',
      '謝謝你願意讓我看見你的難過。',
    ],
  },
  複雜情緒: {
    meaning: '有時情緒是好幾種交織在一起，連自己都說不清。需要的是被允許慢慢理清。',
    howToReceive: '不要逼對方講清楚或下結論。給時間、給空間，陪他一起待著。',
    sampleLines: [
      '就算說不清楚也沒關係，我陪你慢慢理。',
      '你的感覺很複雜我懂，不用一次說完。',
      '我在，你想到什麼再跟我說。',
    ],
  },
};

// Fallback for any emotion label not in the map above — generic but still
// centred on receiving the feeling before solving it.
export const EMOTION_ACCEPTANCE_FALLBACK: EmotionAcceptanceGuide = {
  meaning: '每一種情緒都在表達一個需要。先看見它、接住它，比急著解決更重要。',
  howToReceive: '先別解釋或講道理，承認對方的感受，讓他覺得「你有看見我」。',
  sampleLines: [
    '我聽到你了，你的感受對我很重要。',
    '你先別急，我在這裡，我們慢慢來。',
    '謝謝你願意告訴我，我想好好懂你。',
  ],
};

export function getEmotionAcceptance(emotion: string): EmotionAcceptanceGuide {
  return EMOTION_ACCEPTANCE[emotion] ?? EMOTION_ACCEPTANCE_FALLBACK;
}
