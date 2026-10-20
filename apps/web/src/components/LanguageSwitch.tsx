import type { Locale } from '@lifesim/content-schema';
import { useTranslation } from 'react-i18next';
import { currentLocale, rememberLocale } from '../i18n';

/** 语言名用各自的自称显示，不随界面语言翻译。 */
const LOCALE_NAMES: Record<Locale, string> = { 'zh-Hans': '中文', en: 'English' };

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const active = currentLocale();

  function choose(locale: Locale) {
    rememberLocale(locale);
    void i18n.changeLanguage(locale);
  }

  return (
    <div className="language-switch" role="group" aria-label={t('app.language')}>
      {(Object.keys(LOCALE_NAMES) as Locale[]).map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === active}
          onClick={() => {
            choose(locale);
          }}
        >
          {LOCALE_NAMES[locale]}
        </button>
      ))}
    </div>
  );
}
