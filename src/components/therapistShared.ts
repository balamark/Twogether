import type { TherapistFocusArea } from '../services/api';

// Shared therapist constants/helpers, used by both TherapistsView (directory +
// chat) and PublicQaView (公開問答 browse). Kept in their own module so the two
// views don't import from each other (which would be a circular dependency).
// Components live in their own files (e.g. FilterChip.tsx) so this module stays
// HMR-friendly (react-refresh only-export-components).

// Focus areas — value/label/emoji in one place so filter chips, cards, and forms
// all read from the same source of truth. Order matches the backend FOCUS_AREAS
// list in routes/therapists.js.
export const FOCUS_AREAS: { id: TherapistFocusArea; label: string; emoji: string }[] = [
  { id: 'couple', label: '伴侶關係', emoji: '💞' },
  { id: 'family', label: '家庭', emoji: '🏡' },
  { id: 'childhood', label: '童年/原生家庭', emoji: '🧸' },
  { id: 'individual', label: '個人成長', emoji: '🌱' },
  { id: 'sexuality', label: '性與親密', emoji: '🔥' },
  { id: 'parenting', label: '親職教養', emoji: '👶' },
  { id: 'grief', label: '悲傷失落', emoji: '🕊️' },
  { id: 'anxiety', label: '焦慮憂鬱', emoji: '🌧️' },
  { id: 'depression', label: '憂鬱情緒', emoji: '🌫️' },
  { id: 'trauma', label: '創傷', emoji: '💔' },
  { id: 'addiction', label: '成癮', emoji: '🎯' },
  { id: 'lgbtq', label: '性別與多元認同', emoji: '🏳️‍🌈' },
  { id: 'career', label: '職涯/工作壓力', emoji: '💼' },
  { id: 'self_esteem', label: '自我價值', emoji: '✨' },
];

export const focusLabel = (id: string): string =>
  FOCUS_AREAS.find((f) => f.id === id)?.label || id;

export const formatNtd = (n: number): string => `NT$${n.toLocaleString('en-US')}`;
