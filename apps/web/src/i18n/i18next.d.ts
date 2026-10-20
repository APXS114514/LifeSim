import 'i18next';
import type zhHans from './locales/zh-Hans.json';

// zh-Hans 是参照语言：界面里用到的键在编译期检查，en 的键集合由 locales.test.ts 保证一致。
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof zhHans };
  }
}
