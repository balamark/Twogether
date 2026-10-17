import { tr } from '../i18n/tr';

// Single source of truth for Twogether's product positioning copy.
//
// Twogether is not "AI 心理諮商". It is a Therapy Companion (諮商延伸工具):
// it helps couples carry what a therapist teaches back into everyday life.
// This framing keeps us on the same side as therapists (they can recommend
// us instead of seeing us as a competitor) and sets honest expectations —
// the AI organizes, records and demonstrates; diagnosis and treatment stay
// with a licensed professional.
//
// Keep every user-facing surface (landing page, logged-out showroom, the
// 心理諮商 tab, the AI companion onboarding, README, index.html) pointing at
// these strings so the message stays consistent. See CLAUDE.md.

/** The headline one-liner. Used on the logged-out hero and the 心理諮商 tab. */
export const POSITIONING_ONE_LINER =
  tr('諮商室只有一小時，真正的關係發生在剩下的 167 個小時。', 'A counseling session lasts an hour. Your relationship happens in the other 167.');

/** Second line that says what we do about those 167 hours. */
export const POSITIONING_SUBLINE =
  tr('Twogether 幫你把心理師教的方法，帶回每一天的相處。', 'Twogether helps you bring what your therapist teaches back into every day together.');

/** Short tagline for meta tags / cards (title-friendly, no period). */
export const POSITIONING_TAGLINE = tr('把諮商帶回日常的伴侶練習工具', 'A couples practice tool that brings counseling into everyday life');

/**
 * The honest "not a substitute" disclaimer. Show it wherever we introduce the
 * AI 諮商師 so users know the AI demonstrates, it does not diagnose or treat.
 */
export const NOT_A_SUBSTITUTE =
  tr('Twogether 不取代心理諮商。AI 示範心理師可能會怎麼引導雙方思考，真正的診斷與治療仍由合格的心理師負責。', 'Twogether does not replace counseling. The AI models how a therapist might guide you both to reflect; diagnosis and treatment remain with qualified professionals.');

/** One-line version of the disclaimer for tight spaces (footers, hints). */
export const NOT_A_SUBSTITUTE_SHORT = tr('AI 是日常練習的陪伴，不是診斷或治療；專業協助請找合格心理師。', 'AI keeps you company in daily practice; it is not diagnosis or treatment. For professional help, see a qualified therapist.');
