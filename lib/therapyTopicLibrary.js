// Static Therapy Topics library (話題庫) — a curated set of relationship-
// maintenance topics, always available with no AI generation and no quota
// cost. Content ported from the product's own Topic Library draft (podcast-
// inspired: couple time vs. family time, and tending the relationship itself
// so there's energy left to tend the family). Single source of truth used by
// both the couple's card (routes/events.js) and the therapist's read-only
// view (routes/therapists.js) so neither has to duplicate the copy.

const THERAPY_TOPIC_LIBRARY = [
  {
    id: 'couple-connection',
    title: '孩子之外，我們還是伴侶嗎？',
    description: '成為父母之後，很容易把所有時間都花在「一起帶小孩」，卻忘了單純當彼此的伴侶。',
    prompts: [
      '最近我們有沒有只做「兩個人的事情」？',
      '上一次真正的約會是什麼時候？',
      '我們最近談最多的是孩子，還是彼此？',
      '如果沒有孩子這個共同任務，我們還會怎麼相處？',
    ],
  },
  {
    id: 'family-vs-couple',
    title: '我們是不是把所有能量都給了孩子？',
    description: '把孩子的需求放在第一位是自然的，但久了也可能讓彼此的耐心和連結被悄悄耗掉。',
    prompts: [
      '我們是不是把孩子的需求永遠放在第一位？',
      '我們有沒有因此忽略彼此？',
      '照顧孩子的過程中，我們有沒有開始對彼此失去耐心？',
      '我們怎麼同時成為好父母，也成為好的伴侶？',
    ],
  },
  {
    id: 'relationship-maintenance',
    title: '我們平常有沒有在維護這段關係？',
    description: '關係和其他重要的事一樣，需要固定花心力維護，不會因為沒有吵架就自動變好。',
    prompts: [
      '我們多久有一次真正的約會？',
      '我們多久有一次不談孩子、不談工作的聊天？',
      '最近一次讓對方感受到「我愛你」是什麼時候？',
      '我們現在的關係是靠什麼維持的？',
    ],
  },
];

const LIBRARY_TOPIC_IDS = new Set(THERAPY_TOPIC_LIBRARY.map((t) => t.id));

function isValidLibraryTopicId(topicId) {
  return LIBRARY_TOPIC_IDS.has(topicId);
}

module.exports = { THERAPY_TOPIC_LIBRARY, isValidLibraryTopicId };
