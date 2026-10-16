import { tr } from '../i18n/tr';

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
    meaning: tr('憤怒底下常常是「我覺得不被尊重，或界線被踩到了」。它不是要攻擊你，是想被認真對待。', 'Beneath anger is often "I don\'t feel respected, or a boundary was crossed". It isn\'t trying to attack you; it wants to be taken seriously.'),
    howToReceive: tr('先別急著解釋或反擊。承認對方的感受，讓他知道你聽見了，火氣會先降一半。', 'Don\'t rush to explain or fight back. Acknowledge how they feel and let them know you heard. That alone takes half the heat out.'),
    sampleLines: [
      tr('我聽到你很生氣，這件事對你來說真的很重要。', 'I can hear you\'re really angry. This matters a lot to you.'),
      tr('你會這麼氣，一定是覺得很不被尊重，我想好好聽。', 'You must feel really disrespected to be this angry. I want to listen properly.'),
      tr('我先停下來，不替自己辯解，我想先懂你。', 'I\'ll stop and not defend myself. I want to understand you first.'),
    ],
  },
  失落: {
    meaning: tr('失落是一種「期待落空」的低落。對方需要的不是被打氣，而是被陪著一起待在這個情緒裡。', 'Disappointment is the low of an expectation falling through. They don\'t need a pep talk; they need someone to stay in the feeling with them.'),
    howToReceive: tr('不要急著把他拉出來或叫他想開一點。陪著、承接，讓低落有地方落腳。', 'Don\'t rush to pull them out or tell them to look on the bright side. Stay with them and give the low a place to land.'),
    sampleLines: [
      tr('我感覺得到你很失落，你不用馬上好起來，我陪你。', 'I can tell you\'re really let down. You don\'t have to feel better right away. I\'m here.'),
      tr('這種落空的感覺很難受，謝謝你願意讓我知道。', 'That feeling of falling short is hard. Thank you for letting me know.'),
      tr('我在這裡，你想說多少都可以。', 'I\'m here. Say as much or as little as you want.'),
    ],
  },
  委屈: {
    meaning: tr('委屈是「我為這段關係付出，卻沒被看見」。最需要的是被肯定、被看見努力。', 'Feeling wronged is "I gave to this relationship but it wasn\'t seen". What they need most is to have their effort recognized.'),
    howToReceive: tr('先看見對方的付出與為難，不要先講「可是」。被理解，委屈才放得下。', 'See their effort and difficulty first; don\'t lead with "but". Once they feel understood, they can let it go.'),
    sampleLines: [
      tr('你受委屈了，我有看見你的付出。', 'You\'ve been treated unfairly. I see what you\'ve been giving.'),
      tr('對不起讓你覺得不被看見，這不是你應得的。', 'I\'m sorry I made you feel unseen. You didn\'t deserve that.'),
      tr('你願意說出來我很謝謝你，我想更懂你的為難。', 'Thank you for telling me. I want to understand what\'s been hard for you.'),
    ],
  },
  失望: {
    meaning: tr('失望是「我本來相信會更好」。它其實藏著在乎——不在乎的人不會失望。', 'Disappointment is "I believed it would be better". It actually hides care; people who don\'t care don\'t get disappointed.'),
    howToReceive: tr('承認落差，不要急著辯護自己。讓對方知道他的期待你放在心上。', 'Acknowledge the gap and don\'t rush to defend yourself. Let them know you\'re holding their expectations in mind.'),
    sampleLines: [
      tr('我知道讓你失望了，這代表你其實很在乎我們。', 'I know I let you down. It means you really care about us.'),
      tr('你的期待我聽見了，我想把它放在心上。', 'I heard what you hoped for, and I want to keep it in mind.'),
      tr('謝謝你告訴我，而不是默默把我推遠。', 'Thank you for telling me instead of quietly pushing me away.'),
    ],
  },
  焦慮: {
    meaning: tr('焦慮是對未知與失控的不安。需要的是穩定感與「我們會一起面對」的保證。', 'Anxiety is unease about the unknown and losing control. What\'s needed is steadiness and the promise that "we\'ll face it together".'),
    howToReceive: tr('放慢、放穩。給保證、給陪伴，而不是急著解決或叫他別想太多。', 'Slow down and stay steady. Offer reassurance and company, not a rushed fix or "don\'t overthink it".'),
    sampleLines: [
      tr('你先慢慢呼吸，我在，我們一起面對。', 'Breathe slowly. I\'m here, and we\'ll face this together.'),
      tr('會擔心很正常，不管怎樣我都和你一起。', 'Worrying is normal. Whatever happens, I\'m with you.'),
      tr('不用一個人扛，有我在。', 'You don\'t have to carry this alone. I\'m here.'),
    ],
  },
  孤單: {
    meaning: tr('孤單是「在關係裡卻覺得沒人懂我」。最需要的是被靠近、被在乎。', 'Loneliness is "I\'m in a relationship but no one understands me". What\'s needed most is closeness and care.'),
    howToReceive: tr('主動靠近，讓對方真實感覺到你的存在與在意。', 'Reach out first, so they can really feel you\'re there and that you care.'),
    sampleLines: [
      tr('你不是一個人，我在你身邊。', 'You\'re not alone. I\'m right here with you.'),
      tr('對不起讓你覺得孤單，我想更靠近你一點。', 'I\'m sorry I made you feel lonely. I want to be closer to you.'),
      tr('我想多陪你，告訴我你需要什麼。', 'I want to spend more time with you. Tell me what you need.'),
    ],
  },
  疲憊: {
    meaning: tr('疲憊是「我撐很久了」。需要的是被允許休息、被體諒，而不是被要求再努力。', 'Exhaustion is "I\'ve been holding on for a long time". What\'s needed is permission to rest and understanding, not being asked to try harder.'),
    howToReceive: tr('先讓對方喘口氣，肯定他的辛苦，把「解決」往後放。', 'Let them catch their breath, affirm how hard they\'ve worked, and put "solving" off for later.'),
    sampleLines: [
      tr('你辛苦了，先休息一下，事情等等再說。', 'You\'ve worked so hard. Rest first; we can deal with it later.'),
      tr('你撐很久了，我有看見，謝謝你。', 'You\'ve held on for so long. I see it, and thank you.'),
      tr('先照顧好你自己，剩下的我們一起想辦法。', 'Take care of yourself first. We\'ll figure out the rest together.'),
    ],
  },
  受傷: {
    meaning: tr('受傷是「我們之間發生的事讓我痛」。需要的是被溫柔對待，而不是被講道理。', 'Hurt is "what happened between us hurts me". What\'s needed is gentleness, not being reasoned with.'),
    howToReceive: tr('語氣放軟，先安撫情緒。一個輕柔的動作常勝過一千句解釋。', 'Soften your tone and soothe the feeling first. A gentle gesture often beats a thousand explanations.'),
    sampleLines: [
      tr('我知道我讓你受傷了，我很在意你的感受。', 'I know I hurt you, and I really care about how you feel.'),
      tr('你先別急，我在這裡，我們慢慢來。', 'Take your time. I\'m here, and we\'ll go slowly.'),
      tr('讓我抱你一下，不用說話也可以。', 'Let me hug you for a bit. We don\'t have to talk.'),
    ],
  },
  恐懼: {
    meaning: tr('恐懼是面對威脅時的本能。需要的是安全感與「你不會一個人面對」的承諾。', 'Fear is an instinct when facing a threat. What\'s needed is safety and the promise that "you won\'t face this alone".'),
    howToReceive: tr('先給安全感，穩穩接住，不要否定他的害怕。', 'Give a sense of safety first and hold them steady. Don\'t dismiss their fear.'),
    sampleLines: [
      tr('你會怕我懂，我會陪著你，不會讓你一個人。', 'I understand why you\'re scared. I\'ll be with you; I won\'t leave you alone.'),
      tr('不管發生什麼，我都站在你這邊。', 'Whatever happens, I\'m on your side.'),
      tr('你先靠著我，我們一步一步來。', 'Lean on me. We\'ll take it one step at a time.'),
    ],
  },
  無助: {
    meaning: tr('無助是「我不知道該怎麼辦了」。需要的是有人和他站在一起，而不是被指點。', 'Helplessness is "I don\'t know what to do anymore". What\'s needed is someone standing with them, not being told what to do.'),
    howToReceive: tr('別急著給建議。先讓對方知道他不孤單，再一起想。', 'Don\'t rush to give advice. First let them know they\'re not alone, then think it through together.'),
    sampleLines: [
      tr('我知道你現在很無助，我們一起想，不用你一個人扛。', 'I know you feel helpless right now. Let\'s figure it out together; you don\'t have to carry it alone.'),
      tr('就算還沒有答案，我也會和你一起待在這裡。', 'Even if we don\'t have an answer yet, I\'ll stay here with you.'),
      tr('你不是沒用，是真的太難了，有我在。', 'You\'re not useless. It\'s genuinely hard, and I\'m here.'),
    ],
  },
  羞愧: {
    meaning: tr('羞愧是「我覺得自己不夠好」。最需要的是被接納——「就算這樣，你還是被愛的」。', 'Shame is "I don\'t feel good enough". What\'s needed most is acceptance: "even so, you\'re still loved".'),
    howToReceive: tr('不要評價或追問，給接納與安全。讓對方知道他依然被珍惜。', 'Don\'t judge or press. Offer acceptance and safety, and let them know they\'re still cherished.'),
    sampleLines: [
      tr('不管怎樣你都還是我重視的人。', 'No matter what, you\'re still someone I value.'),
      tr('會這樣覺得不代表你不好，我懂你的難。', 'Feeling this way doesn\'t mean you\'re not good. I understand it\'s hard.'),
      tr('你願意跟我說，我覺得很珍貴。', 'It means a lot that you\'re telling me.'),
    ],
  },
  嫉妒: {
    meaning: tr('嫉妒底下常是「我怕失去你、怕自己不夠重要」。需要的是被肯定的安全感。', 'Beneath jealousy is often "I\'m afraid of losing you, afraid I\'m not important enough". What\'s needed is the security of being affirmed.'),
    howToReceive: tr('不要嘲笑或防衛。先給保證，讓對方確定自己的位置。', 'Don\'t mock or get defensive. Reassure them first so they\'re sure of their place.'),
    sampleLines: [
      tr('你對我來說是特別的，這不會變。', 'You\'re special to me, and that won\'t change.'),
      tr('會在意是因為你重視我們，我懂。', 'You care because you value us. I get it.'),
      tr('我想讓你更安心，告訴我怎麼做會比較好。', 'I want you to feel more secure. Tell me what would help.'),
    ],
  },
  煩躁: {
    meaning: tr('煩躁是情緒已經滿出來的訊號。需要的是空間與被體諒，而不是被追問。', 'Irritability is a sign the feelings are already overflowing. What\'s needed is space and understanding, not questions.'),
    howToReceive: tr('先給空間、降低刺激，不要在這時講道理或加碼。', 'Give space and reduce stimulation. Don\'t reason or escalate right now.'),
    sampleLines: [
      tr('你現在有點滿，我先不吵你，需要我時我都在。', 'You\'re a bit full right now. I\'ll give you space, and I\'m here when you need me.'),
      tr('我們先暫停一下，等你比較舒服再聊。', 'Let\'s pause for now and talk when you feel better.'),
      tr('不急，先讓自己喘口氣。', 'No rush. Catch your breath first.'),
    ],
  },
  內疚: {
    meaning: tr('內疚是「我覺得自己做錯了、對不起你」。需要的是被原諒的空間，而不是被加重指責。', 'Guilt is "I think I did something wrong and let you down". What\'s needed is room to be forgiven, not more blame.'),
    howToReceive: tr('先接住情緒，給台階。讓對方知道一次失誤不會否定他整個人。', 'Hold the feeling first and offer a way back. Let them know one mistake doesn\'t define them.'),
    sampleLines: [
      tr('你會自責代表你很在乎，這件事我們可以一起面對。', 'Blaming yourself shows how much you care. We can face this together.'),
      tr('人都會有做不好的時候，我沒有要怪你。', 'Everyone gets things wrong sometimes. I\'m not blaming you.'),
      tr('謝謝你放在心上，我們往前看。', 'Thank you for taking it to heart. Let\'s look forward.'),
    ],
  },
  被忽視: {
    meaning: tr('被忽視是「我好像不重要」。最需要的是被重新看見、被放回優先順位。', 'Feeling ignored is "I don\'t seem to matter". What\'s needed most is to be seen again and put back as a priority.'),
    howToReceive: tr('承認對方的存在與需要，用行動讓他重新感覺被在乎。', 'Acknowledge their presence and needs, and use actions to make them feel cared for again.'),
    sampleLines: [
      tr('對不起讓你覺得被忽略了，你對我很重要。', 'I\'m sorry I made you feel ignored. You matter a lot to me.'),
      tr('我想多把注意力放在你身上，這是我的疏忽。', 'I want to put more of my attention on you. That was my oversight.'),
      tr('謝謝你說出來，而不是默默忍著。', 'Thank you for saying it instead of quietly putting up with it.'),
    ],
  },
  不安: {
    meaning: tr('不安是對關係或未來的不確定。需要的是穩定的回應與一致的安全感。', 'Insecurity is uncertainty about the relationship or the future. What\'s needed is steady responses and consistent safety.'),
    howToReceive: tr('用穩定、清楚的態度回應，減少對方的猜測與懸著。', 'Respond in a steady, clear way, so they\'re not left guessing or hanging.'),
    sampleLines: [
      tr('我在，我們之間是穩的，你可以放心。', 'I\'m here. Things between us are steady; you can relax.'),
      tr('有什麼讓你不安的，我們攤開來說，我不會跑掉。', 'Whatever\'s making you uneasy, let\'s lay it out. I\'m not going anywhere.'),
      tr('謝謝你願意告訴我，我想讓你更安心。', 'Thank you for telling me. I want you to feel more secure.'),
    ],
  },
  無奈: {
    meaning: tr('無奈是「試過了卻改變不了」的疲累與妥協。需要的是被理解這份為難。', 'Resignation is the weariness and compromise of "I tried but couldn\'t change it". What\'s needed is understanding for how hard that is.'),
    howToReceive: tr('先承認處境的難，不要急著否定或催促。', 'Acknowledge how hard the situation is first. Don\'t rush to dismiss or push.'),
    sampleLines: [
      tr('我知道這真的很無奈，不是你不努力。', 'I know this is really frustrating. It\'s not that you didn\'t try.'),
      tr('這種無能為力的感覺很累，我懂。', 'Feeling powerless like this is exhausting. I get it.'),
      tr('我們一起面對，不用你一個人消化。', 'Let\'s face it together; you don\'t have to process it alone.'),
    ],
  },
  麻木: {
    meaning: tr('麻木常是情緒受傷太久後的自我保護。需要的是溫柔、不勉強的陪伴。', 'Numbness is often self-protection after being hurt for too long. What\'s needed is gentle, no-pressure company.'),
    howToReceive: tr('不要逼對方有反應。安靜地在旁邊，讓他知道你還在。', 'Don\'t push for a reaction. Stay quietly nearby so they know you\'re still there.'),
    sampleLines: [
      tr('你不用勉強有反應，我就在這裡。', 'You don\'t have to react. I\'m right here.'),
      tr('累到沒感覺的時候，我陪你慢慢來。', 'When you\'re too tired to feel anything, I\'ll go slowly with you.'),
      tr('不急，等你準備好，我都在。', 'No rush. Whenever you\'re ready, I\'m here.'),
    ],
  },
  心累: {
    meaning: tr('心累是長期消耗下的疲乏。需要的是被體諒、被允許不必再用力。', 'Emotional exhaustion is fatigue from long-term strain. What\'s needed is understanding and permission to stop trying so hard.'),
    howToReceive: tr('肯定對方的付出與疲倦，讓他可以暫時靠著你。', 'Affirm their effort and tiredness, and let them lean on you for a while.'),
    sampleLines: [
      tr('你心很累了，我有看見，先靠著我休息一下。', 'Your heart is so tired. I see it. Lean on me and rest for a bit.'),
      tr('這段時間真的辛苦你了。', 'These days have been really hard on you.'),
      tr('剩下的我們一起扛，你先喘口氣。', 'We\'ll carry the rest together. Catch your breath first.'),
    ],
  },
  難過: {
    meaning: tr('難過需要的，往往不是解法，而是有人願意陪著一起難過。', 'What sadness needs is often not a solution, but someone willing to be sad alongside you.'),
    howToReceive: tr('先陪伴、先承接。別急著「讓他好起來」，先讓他被懂。', 'Stay with them and hold it first. Don\'t rush to "make them feel better"; let them feel understood first.'),
    sampleLines: [
      tr('我知道你很難過，你可以哭，我陪著你。', 'I know you\'re really sad. You can cry. I\'m with you.'),
      tr('不用急著好起來，我就在這裡。', 'You don\'t have to feel better right away. I\'m right here.'),
      tr('謝謝你願意讓我看見你的難過。', 'Thank you for letting me see your sadness.'),
    ],
  },
  複雜情緒: {
    meaning: tr('有時情緒是好幾種交織在一起，連自己都說不清。需要的是被允許慢慢理清。', 'Sometimes several feelings are tangled together, and even you can\'t put them into words. What\'s needed is permission to sort them out slowly.'),
    howToReceive: tr('不要逼對方講清楚或下結論。給時間、給空間，陪他一起待著。', 'Don\'t push them to explain or reach a conclusion. Give time and space, and stay with them.'),
    sampleLines: [
      tr('就算說不清楚也沒關係，我陪你慢慢理。', 'It\'s okay if you can\'t put it into words. I\'ll help you sort it out slowly.'),
      tr('你的感覺很複雜我懂，不用一次說完。', 'I understand your feelings are complicated. You don\'t have to say it all at once.'),
      tr('我在，你想到什麼再跟我說。', 'I\'m here. Tell me whatever comes to mind.'),
    ],
  },
};

// Fallback for any emotion label not in the map above — generic but still
// centred on receiving the feeling before solving it.
export const EMOTION_ACCEPTANCE_FALLBACK: EmotionAcceptanceGuide = {
  meaning: tr('每一種情緒都在表達一個需要。先看見它、接住它，比急著解決更重要。', 'Every feeling expresses a need. Seeing it and holding it matters more than rushing to solve it.'),
  howToReceive: tr('先別解釋或講道理，承認對方的感受，讓他覺得「你有看見我」。', 'Don\'t explain or reason yet. Acknowledge how they feel so they sense "you see me".'),
  sampleLines: [
    tr('我聽到你了，你的感受對我很重要。', 'I hear you. How you feel matters to me.'),
    tr('你先別急，我在這裡，我們慢慢來。', 'Take your time. I\'m here, and we\'ll go slowly.'),
    tr('謝謝你願意告訴我，我想好好懂你。', 'Thank you for telling me. I want to really understand you.'),
  ],
};

export function getEmotionAcceptance(emotion: string): EmotionAcceptanceGuide {
  return EMOTION_ACCEPTANCE[emotion] ?? EMOTION_ACCEPTANCE_FALLBACK;
}
