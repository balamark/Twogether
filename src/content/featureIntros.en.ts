// English copy for featureIntros.ts, keyed by the same view id. The zh-TW file
// stays the source of truth for WHICH entries exist (and their emoji/order);
// this file only supplies the English title / valueLine / FAQs. When you add or
// rewrite an entry there, update it here too — a missing id falls back to zh-TW.

import type { FeatureIntro } from './featureIntros';

type IntroCopy = Pick<FeatureIntro, 'title' | 'valueLine' | 'faqs'>;

export const FEATURE_INTROS_EN: Record<string, IntroCopy> = {
  home: {
    title: 'Today',
    valueLine:
      'The first thing you see when you open the app: the one thing most worth doing today, patterns Twogether has noticed, and what happened recently.',
    faqs: [
      {
        q: 'How is "the one thing most worth doing today" chosen?',
        a: 'We look at signals like how often you are close, your relationship check-ins and your Love Bank, and pick the single thing that needs attention most. One suggestion at a time, never a pile of reminders.',
      },
      {
        q: 'What is "Twogether noticed"?',
        a: 'It opens the Grow tab, where you can see recurring communication patterns the AI found in your recent conversations (for example, the same argument coming back). The card itself is only a shortcut and never generates anything on its own.',
      },
    ],
  },
  talk: {
    title: 'Talk',
    valueLine:
      'Whatever you two need to work through starts here. Talk opens straight into "Talk it through", and the row on top switches to the emotion check, role play, your wall or a professional counselor.',
    faqs: [
      {
        q: 'What is the row of words at the top?',
        a: 'It is the Talk switcher. Talk opens "Talk it through", the most used tool. To jump to the emotion check, role play, your wall or a counselor, tap the row instead of going back to look for it.',
      },
      {
        q: 'Why are role play, our wall and counselors here?',
        a: 'They are all ways to feel closer, just in different forms: talking things through, leaving a quiet note, trying a new scenario, or getting a real person to help when you are truly stuck. They live in one row, and in your profile menu too.',
      },
    ],
  },
  us: {
    title: 'Us',
    valueLine:
      'Your relationship itself. One side is "we are loving": moments that make you glad it is them. The other is "we are growing": the things you face together to understand and repair. Both matter equally.',
    faqs: [
      {
        q: 'Why two cards, "loving" and "growing"?',
        a: 'Love is not an add-on to problems, and growth is not a substitute for love. Both are part of a relationship. Whether you want to feel closer, feel lost, just had a fight or want to know each other better, your next step is here.',
      },
      {
        q: 'What is the "Love Bank" at the top?',
        a: 'Each of your Love Bank balances, plus the average of both. Only the other person can add to yours (a thank-you deposit, or confirming your deposit request), so it reflects how cared for they feel by you. Tap the card to make a deposit, confirm a request or redeem a gift.',
      },
      {
        q: 'Where did the old calendar go?',
        a: 'It is still here, one level down: open Us and tap the calendar. Your intimacy and cycle records are unchanged.',
      },
    ],
  },
  rediscover: {
    title: 'Rediscover you',
    valueLine:
      'When did you last remember why you fell for them? One question at a time, it walks you back to the person who made your heart race, and ends as a letter about how you two once loved.',
    faqs: [
      {
        q: 'Does AI write love notes for me?',
        a: 'No. It does not write for you; it helps you see again why you love this person. Every line is your own answer.',
      },
      {
        q: 'Who can see my answers?',
        a: 'They stay on this device only. Write slowly, come back any time, or start over.',
      },
    ],
  },
  'daily-love': {
    title: 'What do you still love about them today?',
    valueLine:
      'One small everyday question a day (like "Was there a moment today when you thought: glad it is you?"). Take a minute to note one thing you love about your partner, and build a habit of noticing and thanking each other.',
    faqs: [
      {
        q: 'Is it the same question every day?',
        a: 'No. The question changes daily and you can tap "another one" any time. They are written to feel like everyday life, not homework like "please express gratitude".',
      },
      {
        q: 'What if I do not like any of the questions?',
        a: 'Tap "Let AI suggest new ones" and the AI writes a fresh batch (this uses one AI credit). They join the rotation right away.',
      },
      {
        q: 'Will my partner see what I write?',
        a: 'Yes. It goes on your shared wall so they know you thought of them today.',
      },
    ],
  },
  'see-you': {
    title: 'I see you',
    valueLine:
      'Sometimes love has not gone anywhere; we are just so used to it that we stop seeing it. One question card at a time, note one small thing you noticed about them today, so they know you saw it.',
    faqs: [
      {
        q: 'How is this different from "Save a good moment"?',
        a: '"Save a good moment" is free-form. "I see you" asks you question by question and turns the small daily efforts your partner may not even notice into a sentence that says you saw them.',
      },
      {
        q: 'Can my partner see it?',
        a: 'Yes. It goes on your shared wall (it is not private), because the whole point is for them to hear that you noticed.',
      },
    ],
  },
  secret: {
    title: "Things they don't know",
    valueLine:
      'Is there something you have always admired about them that they may never have heard? Question by question, turn that unspoken admiration into a quiet note for them.',
    faqs: [
      {
        q: 'Is it sent to my partner directly?',
        a: 'Yes. It becomes a quiet note on your shared wall. Not an AI telling them they are great, but you letting them know you have noticed all along.',
      },
    ],
  },
  grow: {
    title: 'Grow',
    valueLine:
      'Are you getting better together? Stats, communication patterns the AI observed, and milestones you reached together.',
    faqs: [
      {
        q: 'Does "communication patterns" regenerate and use credits every time?',
        a: 'No. The result is saved after the first run, so viewing it again is free. It only uses one AI credit the first time, or when you ask for a fresh analysis.',
      },
    ],
  },
  record: {
    title: 'Calendar',
    valueLine:
      'Record intimate moments and moods and the calendar shows your rhythm. If it has been a while, it gently reminds you both to check in.',
    faqs: [
      {
        q: 'Can my partner see my records?',
        a: 'Yes. Once paired, the calendar, intimacy records and achievements are shared. It is a diary for two, not a private notebook. The one exception is your daily mood and intimacy status: private by default, shown to your partner only when you choose to share it.',
      },
      {
        q: 'What is cycle tracking for?',
        a: 'Turn it on in Settings and the calendar marks periods and predictions, so your partner can be a little more considerate at the right time.',
      },
      {
        q: 'What is the light-to-dark shading around the predicted ovulation day?',
        a: 'With cycle tracking on, the calendar estimates the ovulation day from your own cycle lengths (all cycles blended with the latest 3) and shades the 5 days on either side, light to dark. After 3 complete cycles it also estimates a "possible window" from how much your cycles vary. It is a calendar-method estimate, not confirmed ovulation, and says nothing about anyone\'s mood or wishes that day.',
      },
      {
        q: 'Who can see my daily mood and intimacy status?',
        a: 'Tap any calendar day to log your mood and how you feel about intimacy in one tap. Only you can see it by default; your partner sees a day only if you turn on sharing for it, and you can turn that off or clear it any time. Your partner can never fill it in for you, and not recording never means "no".',
      },
      {
        q: 'What is the Love Bank?',
        a: 'You each have a deposit account that only your partner can add to: they make a thank-you deposit when they want to thank you, or you ask for a deposit and they confirm it. Spend your deposits in Love Bank (profile menu, top right, or the relationship house on Today) on a gift from your partner; it\'s deducted only after they agree.',
      },
    ],
  },
  conflict: {
    title: 'Talk · Emotions & check-ins',
    valueLine:
      'Communication starts once feelings are heard. Learn how to respond to how your partner feels, and run regular relationship check-ins to see the whole picture.',
    faqs: [
      {
        q: 'What is the difference between "Talk it through" and "Emotions & check-ins"?',
        a: '"Talk it through" is for one specific issue: write down what hurt, let AI help you phrase it, and your partner replies. "Emotions & check-ins" is everyday maintenance: practicing how to hold each other\'s feelings, relationship check-ins and the relationship house. In the middle of a fight, use "Talk it through"; for upkeep, come here.',
      },
      {
        q: 'What is a relationship check-in?',
        a: 'You each honestly rate areas like communication, intimacy and chores. Once you both finish, the results are revealed together and the AI, like a neutral third party, sums up and suggests what to talk about. We recommend one every one to three months.',
      },
    ],
  },
  events: {
    title: 'Talk · Talk it through',
    valueLine:
      'Write down what is hard to say out loud. AI helps you phrase it so your partner can hear it, and you work through it step by step until it is resolved.',
    faqs: [
      {
        q: 'Will my partner see my original draft?',
        a: 'No. Vent as much as you need; only the AI sees your raw text. It offers three versions (neutral, firm, kind). Pick one and edit it until it feels right before sending, or keep it as a private note.',
      },
      {
        q: 'Who is the AI counselor?',
        a: 'The AI companion you chose at sign-up or in Settings (for example Luma or Sophie). Invite them when a conversation gets stuck; they read the thread and offer advice that does not take sides.',
      },
      {
        q: 'What is a practice card, and how is it different from asking for advice?',
        a: '"Give advice" means the AI counselor reads the thread and offers a neutral suggestion. "Lead a practice card" means they guide you like a real counselor: one exercise at a time (mirroring, perspective-taking, affirmation…), who goes first, a sentence starter to follow, and a gentle score before the next step. "Today\'s practice" tracks the skills you have practiced and your relationship-skill score.',
      },
      {
        q: 'What does "How to hold their feelings" do?',
        a: 'When your partner shares a feeling, do not rush to explain or argue. This button has the AI show you how to acknowledge what they feel first, with a few replies you can use as-is. It follows our "iceberg" principle: the feelings and needs beneath the words are what need to be heard.',
      },
      {
        q: 'Why is writing better than saying it in person?',
        a: 'Words spoken in the moment often come out wrong and land harder than intended. Writing gives you time to find what you really mean, and the AI can help phrase it so your partner can hear it. Edit until it is right, then send. Urgent words can wait until tomorrow; the hurt stays in the draft.',
      },
      {
        q: 'What are "communication patterns"?',
        a: 'On the insights page, Twogether acts like a neutral third party. It reads the issues you recently talked through and helps you spot the cycles that keep repeating (for example: one pursues, the other withdraws, one pushes harder, the other goes quieter). It also gently points out sarcasm hiding behind "rational" words, and offers a small exercise to step out of the cycle together.',
      },
      {
        q: 'What happens when a conversation ends?',
        a: 'When you reach a stopping point, either of you can tap "Wrap up together". You each write one small thing you are willing to do next time, and can agree on one thing together. After you see each other\'s answers and confirm, the conversation is archived and the AI leaves a short observation. The insights page tracks your resolution rate, common topics and communication patterns.',
      },
    ],
  },
  roleplay: {
    title: 'Role play',
    valueLine:
      'Bring something new to your intimate time with scripts: pick one, let AI write an in-character opening invitation, and send it to your partner.',
    faqs: [
      {
        q: 'Can I write my own scripts?',
        a: 'Yes. Tap "Upload script" and paste the text (or paste a Google Docs link to import it). Roles are filled with your nicknames based on the genders you chose in Settings.',
      },
      {
        q: 'Can other people see my scripts?',
        a: 'By default only the two of you can. You can choose to share a custom script anonymously to the creator marketplace, and stop sharing any time.',
      },
    ],
  },
  wall: {
    title: 'Our wall',
    valueLine:
      'Pin what you want to say to each other: everyday things, important things, things that are hard to say face to face. They all have a gentle place here.',
    faqs: [
      {
        q: 'How is this different from texting?',
        a: 'Notes on the wall stay, and important ones can be starred. Unlike a chat that scrolls away, this is a place to look back on together.',
      },
      {
        q: 'Does the AI counselor appear on the wall too?',
        a: 'If a thread gets tense, you can ask your AI counselor to take a look. Their suggestion is shown only to you first, and you decide whether to post it.',
      },
      {
        q: 'What does "Emotion translation" do?',
        a: 'This is our "iceberg" principle: what gets said is only the tip. With emotion translation on, the AI turns each accusation into the feeling and need underneath. For example, "You never put our family first" becomes "I have been feeling insecure lately and need our family to feel like a priority", so your partner hears a need, not an attack.',
      },
    ],
  },
  stories: {
    title: 'Real stories',
    valueLine:
      'Turn your hardest moments and the best things you have read into wisdom for other couples: see how others made it through, and leave your own map of repair.',
    faqs: [
      {
        q: 'What is in "Reads & stories"?',
        a: 'Three kinds of content in one place: editor-picked long reads, real stories couples wrote with a guided template, and articles people shared. Use "All / Reads / Stories" at the top to switch.',
      },
      {
        q: 'How do I share an article I found?',
        a: 'In "Reads & stories", tap "Share" then "Share an article". Paste the text and add the original source (respect the author and make sure you have the right to share it). Up to 5 per day.',
      },
      {
        q: 'Will posting reveal who I am?',
        a: 'Posts use your nickname or appear anonymously, based on the public-sharing option in Settings. Your email and real name are never shown. The choice is locked in when you post, so changing Settings later does not affect published posts.',
      },
      {
        q: 'Can I post before pairing?',
        a: 'Yes. Stories are personal posts, so solo users can share their relationship experience to help others too.',
      },
      {
        q: 'What is "What would you do"?',
        a: 'A series of polls about relationship situations (for example, "After a fight, who should apologize first?"). Pick your answer, see what others chose, and leave a note about why. There is no right answer, only real voices, and you can join before pairing.',
      },
      {
        q: 'What do the three vote types mean?',
        a: '"Helpful": this story gave me direction. "Relatable": I have been through something similar. "Repair worked": the repair approach in the story really works. Votes help good stories reach more people (weekly picks).',
      },
      {
        q: 'What are AI highlights?',
        a: 'After you post, the AI reads your story and picks out 3 key takeaways other couples can learn from, shown on the story page for every reader. This uses your daily AI quota and is skipped if you have none left.',
      },
    ],
  },
  therapists: {
    title: 'Counseling',
    valueLine:
      'For when you are truly stuck: book a video session with a vetted, real human counselor.',
    faqs: [
      {
        q: 'Looking for other couples\' experiences?',
        a: 'Anonymous public Q&A and real stories now live in the Real stories tab, where you can read how others made it through and share your own.',
      },
      {
        q: 'Are the counselors real people?',
        a: 'Yes. Counselors in this tab are vetted human professionals. You can browse their specialties and reviews and book paid video sessions. The AI counselor in your conversations is a free AI feature, which is different.',
      },
    ],
  },
  'intimacy-history': {
    title: 'Intimacy invitations',
    valueLine:
      'Want to be close but shy to ask? Pick a mood or a script and send an invitation. Your partner can accept, suggest another time or offer an alternative.',
    faqs: [
      {
        q: 'What if my partner says no?',
        a: 'When declining, they can offer an alternative (like a hug or a talk). An invitation is about expressing that you want to be close, not about pressure.',
      },
    ],
  },
  'deep-dive': {
    title: 'Emotion deep dive',
    valueLine:
      'Some conflicts hurt more because they touch older feelings. It helps you see what you feel now, write a letter to your past and to yourself, and then find the words you want your partner to understand.',
    faqs: [
      {
        q: 'Will my partner see the letter to my past?',
        a: 'No. Letters to your past and to yourself are only ever for you. Only the final "letter to your partner" is visible to them, and only after you tap share.',
      },
      {
        q: 'It is a long flow. Can I stop midway?',
        a: 'Yes. Every step saves automatically and can be skipped. Tap "Pause for now" and next time you will pick up where you left off.',
      },
      {
        q: 'Can I use it before pairing?',
        a: 'Yes. Exploring on your own and the letters to your past and yourself do not need a partner. Only "share with partner" requires pairing.',
      },
      {
        q: 'Is this analyzing my childhood?',
        a: 'No. It does not diagnose anything, invent memories or tell you who caused what. It simply helps you understand your own feelings. How much you share and how deep you go is up to you.',
      },
    ],
  },
};
