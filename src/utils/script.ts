// Script parsing helpers shared by App.tsx (display-time parsing) and
// ScriptUploadModal (speaker detection / role assignment).

export interface ScriptNicknames {
  partner1: string;
  partner2: string;
  partner1Gender?: string;
  partner2Gender?: string;
}

const MALE_TOKEN_REGEX = /\[男\]|\[他\]/gi;
const FEMALE_TOKEN_REGEX = /\[女\]|\[她\]/gi;

// A dialogue line looks like「名字：對白」— a short speaker name (no brackets,
// parentheses, or spaces) before the first colon. Longer or bracketed prefixes
// are stage directions (e.g.「（場景：教室）」) and stay untouched.
const DIALOGUE_LINE_REGEX = /^([^：:()（）[\]【】\s]{1,12})\s*[：:]\s*(.*)$/;

// Map the gendered role tokens to whichever partner has that gender. Only
// resolvable when the couple has exactly one male and one female profile;
// otherwise return {} so the tokens stay visible and the UI can prompt the
// user to set genders in Settings.
export function resolveGenderNicknames(nicknames: ScriptNicknames): { male?: string; female?: string } {
  const { partner1Gender, partner2Gender } = nicknames;
  if (partner1Gender === 'male' && partner2Gender === 'female') {
    return { male: nicknames.partner1, female: nicknames.partner2 };
  }
  if (partner1Gender === 'female' && partner2Gender === 'male') {
    return { male: nicknames.partner2, female: nicknames.partner1 };
  }
  return {};
}

export function parseScript(content: string, nicknames: ScriptNicknames): string {
  const { male, female } = resolveGenderNicknames(nicknames);
  const lines = content.split('\n').filter(line => line.trim());
  const formattedLines = lines.map(rawLine => {
    let line = rawLine.trim();
    // [男]/[他] and [女]/[她] follow gender; [partner1]/[partner2] stay
    // viewer-relative (you / your partner) regardless of gender.
    if (male) line = line.replace(MALE_TOKEN_REGEX, male);
    if (female) line = line.replace(FEMALE_TOKEN_REGEX, female);
    line = line.replace(/\[partner1\]/gi, nicknames.partner1);
    line = line.replace(/\[partner2\]/gi, nicknames.partner2);

    const match = line.match(DIALOGUE_LINE_REGEX);
    if (match) {
      const [, speaker, dialogue] = match;
      // Idempotent: scripts stored pre-parsed already carry the quotes.
      if (dialogue.startsWith('"') && dialogue.endsWith('"')) {
        return `${speaker}: ${dialogue}`;
      }
      return `${speaker}: "${dialogue}"`;
    }
    return line;
  });

  return formattedLines.join('\n\n');
}

export function scriptHasUnresolvedGenderTokens(content: string): boolean {
  return /\[男\]|\[他\]|\[女\]|\[她\]/i.test(content);
}

// Distinct speaker names found in dialogue lines, in order of first
// appearance. Placeholder tokens never match (the regex excludes brackets).
export function detectScriptSpeakers(content: string): string[] {
  const speakers: string[] = [];
  for (const rawLine of content.split('\n')) {
    const match = rawLine.trim().match(DIALOGUE_LINE_REGEX);
    if (!match) continue;
    if (!speakers.includes(match[1])) speakers.push(match[1]);
  }
  return speakers;
}

// Rewrite assigned speaker names to gender tokens, in speaker position only —
// mentions of the name inside dialogue are left as written.
export function applySpeakerAssignments(
  content: string,
  assignments: Record<string, 'male' | 'female'>
): string {
  return content
    .split('\n')
    .map(rawLine => {
      const match = rawLine.trim().match(DIALOGUE_LINE_REGEX);
      if (!match) return rawLine;
      const [, speaker, dialogue] = match;
      const assigned = assignments[speaker];
      if (!assigned) return rawLine;
      return `${assigned === 'male' ? '[男]' : '[女]'}：${dialogue}`;
    })
    .join('\n');
}
