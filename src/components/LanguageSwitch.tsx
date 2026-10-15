import { Languages } from 'lucide-react';
import { useLanguage, type Locale } from '../i18n/LanguageContext';

// 右上角的語言切換（繁中 / EN）。兩個選項同時可見、目前語言實心標示，
// 一眼就看得出現在是哪一種、點另一個就切換，不用打開選單。

const OPTIONS: { value: Locale; label: string; aria: string }[] = [
  { value: 'zh-TW', label: '繁中', aria: '繁體中文' },
  { value: 'en', label: 'EN', aria: 'English' },
];

export default function LanguageSwitch() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <div
      role="radiogroup"
      aria-label={t('lang.switchLabel')}
      data-testid="language-switch"
      className="flex items-center rounded-full border border-petal-rule p-0.5 shrink-0"
    >
      <Languages className="hidden sm:block w-3.5 h-3.5 mx-1 text-petal-muted" strokeWidth={1.5} aria-hidden />
      {OPTIONS.map((o) => {
        const active = locale === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.aria}
            lang={o.value === 'en' ? 'en' : 'zh-Hant'}
            data-testid={`language-switch-${o.value}`}
            onClick={() => setLocale(o.value)}
            className={`font-body text-xs font-medium px-1.5 sm:px-2.5 min-h-[32px] min-w-[30px] sm:min-w-[36px] rounded-full transition-colors ${
              active ? 'bg-petal-ink text-petal-cream' : 'text-petal-ink-soft hover:text-petal-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
