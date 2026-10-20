import { SUPPORTED_LOCALES, type Locale, type SimEventFact } from '@lifesim/content-schema';

/**
 * 叙事渲染契约（GDD §7 第 7 步、§10）：事实先确定，叙事后渲染。
 * 同一条事实在 zh-Hans 与 en 下渲染结果可以不同，但不能反过来影响事实。
 *
 * 模板占位符采用 `{{name}}`，与界面文本使用的 i18next 插值语法一致，
 * 因此下面的一致性检查同时适用于界面资源与事件叙事模板。
 */
export interface NarrativeProvider {
  render(fact: SimEventFact, locale: Locale): string;
}

/** 嵌套的文本资源：叶子是模板字符串。 */
export interface MessageTree {
  readonly [key: string]: string | MessageTree;
}

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g;

/** 模板中出现的占位符名称（去重、排序）。 */
export function extractPlaceholders(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names].sort();
}

/** 把嵌套资源展开成 `a.b.c → 模板`。 */
export function flattenMessages(tree: MessageTree, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      flat.set(path, value);
    } else {
      for (const [childPath, template] of flattenMessages(value, path)) {
        flat.set(childPath, template);
      }
    }
  }
  return flat;
}

/** 用参数替换 `{{name}}`；缺参数直接报错，避免把占位符原样显示给玩家。 */
export function renderTemplate(
  template: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return template.replace(PLACEHOLDER, (_whole, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing template parameter "${name}"`);
    return String(value);
  });
}

export type LocaleParityIssue =
  | { kind: 'missing-key'; locale: Locale; key: string }
  | { kind: 'empty-message'; locale: Locale; key: string }
  | {
      kind: 'placeholder-mismatch';
      locale: Locale;
      key: string;
      expected: string[];
      actual: string[];
    };

/**
 * 首发两种语言必须键集合一致、无空文案、同一键的占位符集合一致（GDD §10、§15）。
 * 以 zh-Hans 为参照比较其他语言，并双向报告缺失的键。
 */
export function checkLocaleParity(
  resources: Readonly<Record<Locale, MessageTree>>,
): LocaleParityIssue[] {
  const issues: LocaleParityIssue[] = [];
  const [reference, ...others] = SUPPORTED_LOCALES;
  const flat = new Map(
    SUPPORTED_LOCALES.map((locale) => [locale, flattenMessages(resources[locale])]),
  );
  const referenceMessages = flat.get(reference) ?? new Map<string, string>();

  for (const locale of SUPPORTED_LOCALES) {
    for (const [key, template] of flat.get(locale) ?? []) {
      if (template.trim() === '') issues.push({ kind: 'empty-message', locale, key });
    }
  }

  for (const locale of others) {
    const messages = flat.get(locale) ?? new Map<string, string>();
    for (const [key, referenceTemplate] of referenceMessages) {
      const template = messages.get(key);
      if (template === undefined) {
        issues.push({ kind: 'missing-key', locale, key });
        continue;
      }
      const expected = extractPlaceholders(referenceTemplate);
      const actual = extractPlaceholders(template);
      if (expected.join('|') !== actual.join('|')) {
        issues.push({ kind: 'placeholder-mismatch', locale, key, expected, actual });
      }
    }
    for (const key of messages.keys()) {
      if (!referenceMessages.has(key)) issues.push({ kind: 'missing-key', locale: reference, key });
    }
  }
  return issues;
}
