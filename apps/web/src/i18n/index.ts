import { SUPPORTED_LOCALES, type Locale } from '@lifesim/content-schema';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhHans from './locales/zh-Hans.json';

export const resources = { 'zh-Hans': zhHans, en } satisfies Record<Locale, unknown>;

const STORAGE_KEY = 'lifesim.locale';

function isLocale(value: string | null): value is Locale {
  return value !== null && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// 语言偏好只是本机便利设置；存储不可用（隐私模式等）时退回浏览器语言。
function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // 忽略：下次按浏览器语言选择即可。
  }
}

function detectInitialLocale(): Locale {
  const stored = readStoredLocale();
  if (isLocale(stored)) return stored;
  return navigator.languages.some((tag) => tag.toLowerCase().startsWith('zh')) ? 'zh-Hans' : 'en';
}

export function currentLocale(): Locale {
  const language = i18next.resolvedLanguage ?? null;
  return isLocale(language) ? language : 'zh-Hans';
}

i18next.on('languageChanged', (language) => {
  document.documentElement.lang = language;
});

// 资源内联、同步初始化：首屏渲染前语言已经确定。
void i18next.use(initReactI18next).init({
  initAsync: false,
  resources: {
    'zh-Hans': { translation: zhHans },
    en: { translation: en },
  },
  lng: detectInitialLocale(),
  supportedLngs: [...SUPPORTED_LOCALES],
  load: 'currentOnly',
  // 两种语言键集合由测试保证一致，不做静默回退，缺键会直接暴露。
  fallbackLng: false,
  interpolation: { escapeValue: false },
});

export default i18next;
