/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest 默认不处理 CSS（导入得到空模块），所以直接读源文件。
const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/**
 * 设计令牌的对比度（WCAG 2.x）：正文与小字 ≥ 4.5，表单控件边界 ≥ 3。
 * #66CCFF 很浅：白字放在它上面只有约 1.8，所以主按钮必须用 --color-on-primary（深色）。
 */

function block(css: string, marker: RegExp): Record<string, string> {
  const start = css.search(marker);
  if (start < 0) throw new Error(`Token block ${String(marker)} not found`);
  const open = css.indexOf('{', css.indexOf(':root', start));
  const close = css.indexOf('}', open);
  const tokens: Record<string, string> = {};
  for (const match of css
    .slice(open + 1, close)
    .matchAll(/(--color-[a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    const [, name, value] = match;
    if (name && value) tokens[name] = value.toLowerCase();
  }
  return tokens;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const light = block(tokensCss, /^:root\s*\{/m);
const dark = block(tokensCss, /@media \(prefers-color-scheme: dark\)/);

/** [前景, 背景, 最低对比度] */
const PAIRS: readonly [string, string, number][] = [
  ['--color-text', '--color-background', 4.5],
  ['--color-text', '--color-surface', 4.5],
  ['--color-text', '--color-surface-muted', 4.5],
  ['--color-text', '--color-primary-soft', 4.5],
  ['--color-text-secondary', '--color-background', 4.5],
  ['--color-text-secondary', '--color-surface', 4.5],
  ['--color-text-secondary', '--color-surface-muted', 4.5],
  ['--color-primary-strong', '--color-surface', 4.5],
  ['--color-primary-strong', '--color-background', 4.5],
  ['--color-primary-strong', '--color-primary-soft', 4.5],
  ['--color-on-primary', '--color-primary', 4.5],
  ['--color-on-primary', '--color-primary-hover', 4.5],
  ['--color-success-ink', '--color-surface', 4.5],
  ['--color-warning-ink', '--color-surface', 4.5],
  ['--color-danger-ink', '--color-surface', 4.5],
  ['--color-daily-ink', '--color-surface', 4.5],
  ['--color-daily-ink', '--color-surface-muted', 4.5],
  ['--color-border-strong', '--color-surface', 3],
  ['--color-text-faint', '--color-surface', 3],
];

describe('design tokens (M4-022)', () => {
  it('uses #66CCFF as the brand colour in both colour schemes', () => {
    expect(light['--color-primary']).toBe('#66ccff');
    expect(dark['--color-primary']).toBe('#66ccff');
  });

  it('never puts white text on the brand colour', () => {
    expect(contrast('#ffffff', '#66ccff')).toBeLessThan(2);
    expect(light['--color-on-primary']).not.toBe('#ffffff');
  });

  for (const [scheme, tokens] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`meets WCAG contrast for text and controls in the ${scheme} scheme`, () => {
      const failures: string[] = [];
      for (const [foreground, background, minimum] of PAIRS) {
        const fg = tokens[foreground];
        const bg = tokens[background];
        if (!fg || !bg) {
          failures.push(`${foreground} or ${background} is missing`);
          continue;
        }
        const ratio = contrast(fg, bg);
        if (ratio < minimum) failures.push(`${foreground} on ${background}: ${ratio.toFixed(2)}`);
      }
      expect(failures).toEqual([]);
    });
  }
});
