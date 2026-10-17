// English copy for communicationPrinciples.ts, keyed by principle id. The
// zh-TW file stays the source of truth for which principles exist and their
// icons; this only supplies the English text. Keep the two in sync.

import type { CommunicationPrinciple } from './communicationPrinciples';

type PrincipleCopy = Pick<CommunicationPrinciple, 'conceptTag' | 'title' | 'struggle' | 'help'>;

export const COMMUNICATION_PRINCIPLES_EN: Record<CommunicationPrinciple['id'], PrincipleCopy> = {
  iceberg: {
    conceptTag: 'Iceberg',
    title: 'What gets said is only the tip of the iceberg',
    struggle:
      'you are upset about something small but cannot say what you really care about, and your partner only hears blame, not the need underneath.',
    help: 'We help you see the feelings and needs beneath the words, turning "you never care" into "I need to feel valued", so your partner hears a need instead of an attack.',
  },
  pattern: {
    conceptTag: 'Pattern',
    title: 'See the loop you keep getting stuck in',
    struggle:
      'one of you speaks and it sounds like an attack, the other puts up a wall, and it escalates. Even calm words can carry an edge.',
    help: 'Like a neutral third party, we help you spot the cycle that keeps repeating (pursue, withdraw, push harder, go quieter) and point out the edge behind "rational" words, so you can step out of it together instead of raising the stakes.',
  },
  writing: {
    conceptTag: 'Writing',
    title: 'Write it, so it comes out right',
    struggle:
      'words said in the moment come out wrong and cause hurt nobody meant.',
    help: 'Write it down first. AI helps shape it into something your partner can hear, and you edit until it feels right before sending. Urgent words can wait until tomorrow; the hurt stays in the draft.',
  },
};
