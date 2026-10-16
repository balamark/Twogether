import type { TherapistFocusArea } from '../services/api';
import { tr } from '../i18n/tr';

// Shared therapist constants/helpers, used by both TherapistsView (directory +
// chat) and PublicQaView (公開問答 browse). Kept in their own module so the two
// views don't import from each other (which would be a circular dependency).
// Components live in their own files (e.g. FilterChip.tsx) so this module stays
// HMR-friendly (react-refresh only-export-components).

// Focus areas — value/label/emoji in one place so filter chips, cards, and forms
// all read from the same source of truth. Order matches the backend FOCUS_AREAS
// list in routes/therapists.js.
export const FOCUS_AREAS: { id: TherapistFocusArea; label: string; emoji: string }[] = [
  { id: 'couple', label: tr('伴侶關係', 'Couples & relationships'), emoji: '💞' },
  { id: 'family', label: tr('家庭', 'Family'), emoji: '🏡' },
  { id: 'childhood', label: tr('童年/原生家庭', 'Childhood / family of origin'), emoji: '🧸' },
  { id: 'individual', label: tr('個人成長', 'Personal growth'), emoji: '🌱' },
  { id: 'sexuality', label: tr('性與親密', 'Sex & intimacy'), emoji: '🔥' },
  { id: 'parenting', label: tr('親職教養', 'Parenting'), emoji: '👶' },
  { id: 'grief', label: tr('悲傷失落', 'Grief & loss'), emoji: '🕊️' },
  { id: 'anxiety', label: tr('焦慮憂鬱', 'Anxiety & depression'), emoji: '🌧️' },
  { id: 'depression', label: tr('憂鬱情緒', 'Low mood'), emoji: '🌫️' },
  { id: 'trauma', label: tr('創傷', 'Trauma'), emoji: '💔' },
  { id: 'addiction', label: tr('成癮', 'Addiction'), emoji: '🎯' },
  { id: 'lgbtq', label: tr('性別與多元認同', 'Gender & LGBTQ+ identity'), emoji: '🏳️‍🌈' },
  { id: 'career', label: tr('職涯/工作壓力', 'Career / work stress'), emoji: '💼' },
  { id: 'self_esteem', label: tr('自我價值', 'Self-worth'), emoji: '✨' },
];

export const focusLabel = (id: string): string =>
  FOCUS_AREAS.find((f) => f.id === id)?.label || id;

export const formatNtd = (n: number): string => `NT$${n.toLocaleString('en-US')}`;
