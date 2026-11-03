import { tr, getLocale } from '../i18n/tr';
import { GUEST_USER_ID as ME, GUEST_PARTNER_ID as PARTNER, GUEST_COUPLE_ID as COUPLE, guestNickname, guestPartnerNickname } from './guestMode';

// ─── The sample couple every guest session starts with ──────────────────────
// 小安 (the visitor) ❤ 阿哲 (the sample partner), together ~2 years. Rows are
// stored in the same snake_case shapes the real API returns, so the real views
// render them unchanged. Dates are relative to "now" so the app always looks
// alive (a mood logged yesterday, a moment from last week, an open conflict).
// Bump VERSION when the shape changes so old sessions reseed.

export interface GuestDb {
  version: number;
  seededAt: string;
  [table: string]: unknown;
}

// Typed accessors for the tables (all arrays of plain JSON rows).
export type Row = Record<string, unknown>;

const DAY = 86400000;
export const iso = (daysAgo: number, hour = 20, minute = 0): string => {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
export const ymd = (daysAgo: number): string => {
  const d = new Date(Date.now() - daysAgo * DAY);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const me = () => ({ id: ME, nickname: guestNickname() });
const partner = () => ({ id: PARTNER, nickname: guestPartnerNickname() });

function seedMoments(): Row[] {
  const rows: [number, string, string, string, string, string][] = [
    // daysAgo, who, activity, notes, location, description
    [2, PARTNER, 'intimate', tr('週末早上賴床，誰都不想先起來。', 'Lazy weekend morning, neither wanted to get up first.'), tr('家裡', 'Home'), ''],
    [6, ME, 'date', tr('河堤散步聊了好久，買了兩杯珍奶。', 'Long walk by the river, two bubble teas.'), tr('大稻埕', 'Dadaocheng'), tr('散步約會', 'Walking date')],
    [11, ME, 'intimate', tr('他煮了晚餐，還記得我不吃香菜。', 'He cooked dinner and remembered I hate coriander.'), tr('家裡', 'Home'), ''],
    [19, PARTNER, 'date', tr('第一次一起去看海。風很大，但誰都不想先說要走。', 'First trip to the sea together. Windy, but neither wanted to leave first.'), tr('福隆', 'Fulong'), tr('一日小旅行', 'Day trip')],
    [27, ME, 'intimate', '', tr('家裡', 'Home'), ''],
    [41, PARTNER, 'intimate', tr('一起看完一整季影集。', 'Binged a whole season together.'), tr('家裡', 'Home'), ''],
    [58, ME, 'date', tr('紀念日晚餐，他偷偷訂了窗邊的位子。', 'Anniversary dinner; he secretly booked the window table.'), tr('信義區', 'Xinyi'), tr('紀念日', 'Anniversary')],
  ];
  return rows.map(([days, who, type, notes, location, description], i) => ({
    id: `gm-${i + 1}`,
    moment_date: iso(days, 21, 30),
    created_at: iso(days, 22, 10),
    notes,
    location,
    description,
    duration: type === 'date' ? tr('3 小時', '3 hours') : '',
    activity_type: type,
    coins_earned: 10,
    recorded_by: who === ME ? me() : partner(),
    my_response: null,
    partner_response: who === ME && i === 1 ? { reaction: 'love', note: tr('下次再去！', 'Let\'s go again!'), created_at: iso(days, 23) } : null,
  }));
}

function seedDayStatus(): Row[] {
  const moods = ['good', 'great', 'okay', 'stressed', 'low', 'good', 'great', 'good', 'okay', 'great', 'good', 'stressed', 'good'];
  const rows: Row[] = [];
  moods.forEach((mood, i) => {
    const daysAgo = 13 - i;
    rows.push({ user_id: ME, date: ymd(daysAgo), mood, intimacy_intention: i % 4 === 0 ? 'start_with_cuddles' : null, sharing_enabled: true });
  });
  ['great', 'good', 'good', 'okay', 'good', 'great', 'stressed', 'good', 'good', 'great'].forEach((mood, i) => {
    rows.push({ user_id: PARTNER, date: ymd(10 - i), mood, intimacy_intention: i === 9 ? 'want_intimacy' : null, sharing_enabled: true });
  });
  return rows;
}

function msg(id: string, eventId: string, sender: string, content: string, at: string, extra: Row = {}): Row {
  return { id, event_id: eventId, sender_id: sender, content, is_ai: false, created_at: at, read_at: at, ...extra };
}

function seedEvents(): Row[] {
  const e1 = 'ge-1';
  const e2 = 'ge-2';
  const e3 = 'ge-3';
  return [
    {
      id: e1, couple_id: COUPLE, created_by: ME,
      title: tr('說好的晚餐，他又遲到沒說', 'He was late for dinner again without telling me'),
      summary: tr('約好七點吃飯，他八點才到，訊息也沒回。我等到很失落，覺得自己不重要。', 'We agreed on 7pm; he showed up at 8 and didn\'t reply to messages. I felt let down and unimportant.'),
      detail: null,
      emotions: ['失望', '被忽視', '委屈'], tags: [tr('時間', 'Time'), tr('溝通', 'Communication')], toxicity_flags: [],
      versions: {
        neutral: tr('昨天約七點，你八點才到，中間沒有訊息。我想跟你聊聊這件事。', 'Yesterday we planned 7; you came at 8 with no message in between. I\'d like to talk about it.'),
        firm: tr('約好的時間遲到一小時又不回訊息，這讓我很不舒服，我希望下次能先說。', 'Being an hour late without replying really bothers me. Next time I need a heads-up.'),
        warm: tr('昨天等你的時候我有點失落，因為很期待跟你吃飯。下次會晚的話，可以先跟我說一聲嗎？', 'I felt a bit down waiting yesterday because I was looking forward to dinner with you. If you\'ll be late next time, could you let me know?'),
      },
      selected_version: 'warm', status: 'open', is_private: false, public_status: 'private',
      created_at: iso(1, 21), updated_at: iso(0, 9), unread_count: 1,
      last_message_preview: tr('對不起，昨天被主管叫住…', 'Sorry, my boss caught me yesterday…'),
      translation_enabled: false,
      messages: [
        msg('gm-e1-1', e1, ME, tr('昨天等你的時候我有點失落，因為很期待跟你吃飯。下次會晚的話，可以先跟我說一聲嗎？', 'I felt a bit down waiting yesterday because I was looking forward to dinner with you. If you\'ll be late next time, could you let me know?'), iso(1, 21, 5)),
        msg('gm-e1-2', e1, PARTNER, tr('對不起，昨天被主管叫住，手機又沒電。我知道你等很久，下次我一定先傳訊息。', 'Sorry, my boss caught me and my phone died. I know you waited a long time; next time I\'ll text first.'), iso(0, 8, 40), { read_at: null }),
      ],
    },
    {
      id: e2, couple_id: COUPLE, created_by: PARTNER,
      title: tr('家事分工好像都是我在做', 'It feels like I do all the chores'),
      summary: tr('這兩週碗都是我洗、垃圾也是我倒，想討論怎麼分比較公平。', 'For two weeks I\'ve done all the dishes and trash; I\'d like to figure out a fairer split.'),
      detail: null,
      emotions: ['委屈', '疲憊'], tags: [tr('家務', 'Chores')], toxicity_flags: [],
      versions: { neutral: '', firm: '', warm: tr('最近家事好像多半落在我身上，我有點累。我們可以一起排一下怎麼分嗎？', 'Lately most chores seem to land on me and I\'m tired. Can we work out a split together?') },
      selected_version: 'warm', status: 'resolved', is_private: false, public_status: 'private',
      resolved_at: iso(9, 22), created_at: iso(12, 20), updated_at: iso(9, 22), unread_count: 0,
      last_message_preview: tr('好，就這樣說定 🙌', 'Deal 🙌'),
      therapy_note: null,
      messages: [
        msg('gm-e2-1', e2, PARTNER, tr('最近家事好像多半落在我身上，我有點累。我們可以一起排一下怎麼分嗎？', 'Lately most chores seem to land on me and I\'m tired. Can we work out a split together?'), iso(12, 20, 5)),
        msg('gm-e2-2', e2, ME, tr('謝謝你說出來，我真的沒注意到。那我負責洗碗跟週末打掃，你負責倒垃圾跟洗衣服？', 'Thanks for telling me; I honestly hadn\'t noticed. I\'ll take dishes and weekend cleaning, you take trash and laundry?'), iso(11, 21)),
        msg('gm-e2-3', e2, '', tr('你們都先看見了對方的辛苦，再談分工，這是很好的順序。可以約一週後回頭看看這個分法順不順。', 'You both acknowledged each other\'s effort before splitting tasks — a great order. Check in a week from now to see how it\'s working.'), iso(11, 21, 10), { is_ai: true, ai_therapist: 'luma' }),
        msg('gm-e2-4', e2, PARTNER, tr('好，就這樣說定 🙌', 'Deal 🙌'), iso(9, 22)),
      ],
    },
    {
      id: e3, couple_id: COUPLE, created_by: ME,
      title: tr('週末要不要回老家', 'Whether to visit family this weekend'),
      summary: tr('他想每週回老家，我想留一些兩個人的週末。', 'He wants to visit his family every weekend; I want some weekends just for us.'),
      detail: null,
      emotions: ['焦慮', '孤單'], tags: [tr('家人', 'Family')], toxicity_flags: [],
      versions: { neutral: '', firm: '', warm: tr('我很喜歡你的家人，也想留一些只有我們的週末。我們可以一起排排看嗎？', 'I really like your family, and I also want some weekends just for us. Can we plan it together?') },
      selected_version: 'warm', status: 'open', is_private: false, public_status: 'private',
      created_at: iso(4, 22), updated_at: iso(4, 22), unread_count: 0, last_message_preview: null,
      translation_enabled: false,
      messages: [
        msg('gm-e3-1', e3, ME, tr('我很喜歡你的家人，也想留一些只有我們的週末。我們可以一起排排看嗎？', 'I really like your family, and I also want some weekends just for us. Can we plan it together?'), iso(4, 22, 5)),
      ],
    },
  ];
}

function seedWall(): Row[] {
  const post = (id: string, who: string, content: string, mood: string | null, days: number, extra: Row = {}): Row => ({
    id, content, mood_tag: mood, category: 'general', author_id: who,
    author_nickname: who === ME ? guestNickname() : guestPartnerNickname(),
    reply_count: 0, media: [], is_private: false, partner_read_at: iso(days, 23),
    partner_reaction: null, my_reaction: null, public_status: 'private', public_title: null,
    created_at: iso(days, 12), updated_at: iso(days, 12), ...extra,
  });
  return [
    post('gw-1', PARTNER, tr('今天下雨，想到你沒帶傘，幫你放了一把在公司樓下警衛室 ☔', 'It\'s raining and you forgot your umbrella — left one at your office front desk ☔'), '開心', 0, { partner_read_at: null }),
    post('gw-2', ME, tr('謝謝你昨天陪我加班到最後，還帶了宵夜。', 'Thanks for staying with me until I finished work last night, and for the late-night snack.'), '感謝', 3, { partner_reaction: { reaction: 'hug', created_at: iso(3, 13) } }),
    post('gw-3', PARTNER, tr('其實我很怕你覺得我不夠在乎。我只是不太會說。', 'Honestly, I\'m scared you think I don\'t care enough. I\'m just not great at saying it.'), '想被抱抱', 8, { my_reaction: 'understand', reply_count: 1 }),
    post('gw-4', ME, tr('想把這週記下來：我們第一次沒吵起來就把家事分好了 ✨', 'Writing this week down: the first time we split chores without a fight ✨'), '開心', 9),
  ];
}

export function buildSeed(): GuestDb {
  return {
    version: buildSeed.VERSION,
    seededAt: new Date().toISOString(),
    locale: getLocale(),
    dirty: false,
    couple: {
      id: COUPLE,
      couple_name: tr('安哲小日子', 'Ann & Jay'),
      anniversary_date: ymd(730),
      first_meet_date: ymd(800),
      first_date: ymd(760),
      first_kiss_date: ymd(745),
      first_kiss_place: tr('淡水河邊', 'By the Tamsui river'),
      user1_id: ME, user1_nickname: guestNickname(), user1_gender: 'female', user1_timezone: 'Asia/Taipei',
      user2_id: PARTNER, user2_nickname: guestPartnerNickname(), user2_gender: 'male', user2_timezone: 'Asia/Taipei',
      primary_timezone: 'Asia/Taipei',
      created_at: iso(200),
    },
    love_moments: seedMoments(),
    cycle_records: [
      { id: 'gc-1', tracked_by: ME, start_date: ymd(33), length_days: 5, notes: '', created_at: iso(33) },
      { id: 'gc-2', tracked_by: ME, start_date: ymd(5), length_days: 5, notes: '', created_at: iso(5) },
    ],
    day_status: seedDayStatus(),
    events: seedEvents(),
    wall: seedWall(),
    wall_replies: [
      { id: 'gwr-1', post_id: 'gw-3', content: tr('我知道你在乎，你做的事我都看得到。', 'I know you care. I see everything you do.'), author_id: ME, author_nickname: guestNickname(), created_at: iso(8, 13) },
    ],
    assessments: [
      // The visitor's own result is left empty on purpose: taking the quiz is the fun part.
      { user_id: PARTNER, type: 'love_language', result: 'touch', scores: { words: 3, time: 4, gifts: 1, service: 2, touch: 5 }, updated_at: iso(20) },
    ],
    love_wishes: [
      { id: 'glw-1', user_id: PARTNER, content: tr('出門前抱我一下', 'A hug before leaving the house') },
      { id: 'glw-2', user_id: PARTNER, content: tr('週末一起去早午餐', 'Weekend brunch together') },
    ],
    journey: [
      { id: 'gj-1', emoji: '🏠', title: tr('一起搬進新家', 'Moved in together'), date: ymd(180), place: tr('台北', 'Taipei'), description: tr('紙箱堆到天花板，晚餐吃泡麵也很開心。', 'Boxes to the ceiling; instant noodles for dinner and still happy.') },
      { id: 'gj-2', emoji: '🐶', title: tr('領養了豆豆', 'Adopted Doudou'), date: ymd(90), place: '', description: tr('家裡多了一個會搶被子的成員。', 'A new family member who steals the blanket.') },
    ],
    journey_enrich: {},
    checkins: [
      { id: 'gk-1', nickname: guestPartnerNickname(), isMine: false, trust: 8, commitment: 9, connection: 7, note: tr('最近比較忙，但很想多陪你。', 'Busy lately, but I want to be with you more.'), createdAt: iso(6) },
      { id: 'gk-2', nickname: guestNickname(), isMine: true, trust: 8, commitment: 8, connection: 6, note: null, createdAt: iso(20) },
    ],
    deposits: [
      { id: 'gd-1', kind: 'auto', status: 'confirmed', amount: 1, note: tr('牆上的貼心留言', 'A kind note on the wall'), gift_icon: null, category: 'wall_post', owner_id: ME, created_by: PARTNER, created_at: iso(3, 13), responded_at: iso(3, 13) },
      { id: 'gd-2', kind: 'thanks', status: 'confirmed', amount: 30, note: tr('謝謝你送傘來', 'Thanks for the umbrella'), gift_icon: '☔', category: null, owner_id: PARTNER, created_by: ME, created_at: iso(0, 13), responded_at: iso(0, 13) },
      { id: 'gd-3', kind: 'redeem', status: 'pending', amount: 150, note: tr('想兌換：一次全身按摩', 'Redeem: a full-body massage'), gift_icon: '💆', category: null, owner_id: PARTNER, created_by: PARTNER, created_at: iso(1, 19), responded_at: null },
      { id: 'gd-4', kind: 'thanks', status: 'confirmed', amount: 50, note: tr('謝謝你煮晚餐', 'Thanks for cooking dinner'), gift_icon: '🍳', category: null, owner_id: ME, created_by: PARTNER, created_at: iso(11, 22), responded_at: iso(11, 22) },
    ],
    balances: { [ME]: 320, [PARTNER]: 280 },
    script_favorites: [],
    intimacy_requests: [
      {
        id: 'gir-1', requester_id: PARTNER, recipient_id: ME, request_type: 'intimate',
        message_content: tr('今晚想早點睡、抱著你聊聊天 🌙', 'Want to go to bed early tonight and cuddle and chat 🌙'),
        status: 'accepted', response_message: tr('好呀，我洗完澡就來', 'Yes! Right after my shower'),
        created_at: iso(5, 19), responded_at: iso(5, 19, 20),
        requester_nickname: guestPartnerNickname(), recipient_nickname: guestNickname(),
      },
    ],
    feedback_mine: [],
  };
}
buildSeed.VERSION = 2;
