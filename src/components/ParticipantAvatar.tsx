import React from 'react';
import { getCompanion } from '../utils/aiCompanions';

// A small circular avatar that makes each speaker in a multi-party conversation
// identifiable at a glance. Humans get a stable color (hashed from a per-person
// key) plus the first character of their name; the AI 諮商師 shows its persona
// emoji; the human therapist shows 🩺. There was no avatar/colour utility in the
// codebase before this — speakers were told apart only by role-keyed bubble tints.

export type ParticipantRole = 'user' | 'ai' | 'therapist';

// Curated Soft Petal palette for human speakers. Deep enough that a white initial
// stays legible; picked to stay distinct from one another and from the fixed
// AI (sage) / therapist (pink) slots.
const HUMAN_COLORS = [
  '#B86E64', // rose-deep
  '#7D8F75', // sage-deep
  '#A9713F', // clay
  '#6E8299', // dusty blue
  '#8E6C86', // plum
  '#5F8A72', // green
  '#B08A4F', // ochre
];

// Deterministic string hash so the same person always maps to the same colour.
function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// First grapheme of a name — Array.from keeps CJK / emoji intact.
function firstGrapheme(name: string): string {
  const s = (name || '').trim();
  if (!s) return '?';
  return Array.from(s)[0];
}

const SIZES = {
  xs: 'w-4 h-4 text-[9px]',
  sm: 'w-5 h-5 text-[10px]',
  md: 'w-6 h-6 text-[11px]',
} as const;

interface ParticipantAvatarProps {
  name?: string;
  role?: ParticipantRole;
  // Stable per-person key (e.g. senderId, else senderName). Defaults to name.
  colorKey?: string;
  // AI persona id, used to pick the persona emoji when role === 'ai'.
  companionId?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

const ParticipantAvatar: React.FC<ParticipantAvatarProps> = ({
  name,
  role = 'user',
  colorKey,
  companionId,
  size = 'sm',
  className = '',
}) => {
  const base = `inline-flex items-center justify-center rounded-full shrink-0 select-none leading-none ${SIZES[size]} ${className}`;

  if (role === 'ai') {
    const emoji = getCompanion(companionId)?.emoji || '💛';
    return (
      <span
        className={`${base} bg-petal-sage/25 border border-petal-sage/50`}
        role="img"
        aria-label={name || 'AI 諮商師'}
        data-testid="participant-avatar"
      >
        <span aria-hidden>{emoji}</span>
      </span>
    );
  }

  if (role === 'therapist') {
    return (
      <span
        className={`${base} bg-pink-100 border border-pink-200`}
        role="img"
        aria-label={name || '諮商師'}
        data-testid="participant-avatar"
      >
        <span aria-hidden>🩺</span>
      </span>
    );
  }

  const bg = HUMAN_COLORS[hashKey(colorKey || name || '?') % HUMAN_COLORS.length];
  return (
    <span
      className={`${base} text-white font-medium`}
      style={{ backgroundColor: bg }}
      role="img"
      aria-label={name || '參與者'}
      data-testid="participant-avatar"
    >
      <span aria-hidden>{firstGrapheme(name || '')}</span>
    </span>
  );
};

export default ParticipantAvatar;
