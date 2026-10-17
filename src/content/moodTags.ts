import { isEnglish } from '../i18n/tr';

// Wall mood tags are STORED as these 繁中 strings (the server whitelists them in
// routes/wall.js, and old posts already carry them), so the value never changes
// with the interface language. Only the label shown on screen is translated.
// Custom tags users typed themselves fall through unchanged.
const MOOD_TAG_EN: Record<string, string> = {
  想念你: 'Missing you',
  需要空間: 'Need space',
  想被抱抱: 'Want a hug',
  想溝通: 'Want to talk',
  感謝: 'Grateful',
  撒嬌: 'Being sweet',
  開心: 'Happy',
  難過: 'Sad',
  有想法: 'Have a thought',
  我看見你: 'I see you',
  他不知道的事: "Things they don't know",
  今天喜歡你: 'Loving you today',
};

export function moodTagLabel(tag: string): string {
  return isEnglish() ? MOOD_TAG_EN[tag] ?? tag : tag;
}
