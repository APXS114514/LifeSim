import type { Locale } from '@lifesim/content-schema';
import { createTemplateNarrator, mergeMessageTrees } from '@lifesim/narrative';
import { SYNTHETIC_LABELS, syntheticRegion } from '@lifesim/synthetic-world';
import { LIFE_NARRATIVE } from '@lifesim/systems';

/** headless 入口的组合根：M1 只有合成地区。 */
export const region = syntheticRegion;

export const resources: Record<Locale, ReturnType<typeof mergeMessageTrees>> = {
  'zh-Hans': mergeMessageTrees(LIFE_NARRATIVE['zh-Hans'], SYNTHETIC_LABELS['zh-Hans']),
  en: mergeMessageTrees(LIFE_NARRATIVE.en, SYNTHETIC_LABELS.en),
};

/** 整数最小单位 → 按语言格式化的主币金额（两位小数）。 */
export function formatMoney(minor: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export const narrator = createTemplateNarrator({
  resources,
  formatParam: (name, value, locale) =>
    name.endsWith('Minor') && typeof value === 'number' ? formatMoney(value, locale) : undefined,
});

export function isLocale(value: string): value is Locale {
  return value === 'zh-Hans' || value === 'en';
}

/** 命令行参数；忽略开头的 `--`（`pnpm life -- --seed x` 与 `pnpm life --seed x` 都可以）。 */
export function cliArgs(): string[] {
  const args = process.argv.slice(2);
  return args[0] === '--' ? args.slice(1) : args;
}
