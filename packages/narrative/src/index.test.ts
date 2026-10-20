import { describe, expect, it } from 'vitest';
import { checkLocaleParity, extractPlaceholders, flattenMessages, renderTemplate } from './index';

describe('extractPlaceholders', () => {
  it('finds each placeholder once, sorted', () => {
    expect(extractPlaceholders('{{name}} 于 {{ year }} 年出生；{{name}}')).toEqual([
      'name',
      'year',
    ]);
  });
});

describe('flattenMessages', () => {
  it('turns nested resources into dotted keys', () => {
    const flat = flattenMessages({ app: { title: 'LifeSim', status: { m0: 'sketch' } } });
    expect([...flat]).toEqual([
      ['app.title', 'LifeSim'],
      ['app.status.m0', 'sketch'],
    ]);
  });
});

describe('renderTemplate', () => {
  it('substitutes parameters', () => {
    expect(renderTemplate('Born in {{year}}', { year: 1978 })).toBe('Born in 1978');
  });

  it('throws instead of showing a raw placeholder', () => {
    expect(() => renderTemplate('Born in {{year}}', {})).toThrow(/year/);
  });
});

describe('checkLocaleParity', () => {
  it('accepts matching resources', () => {
    const issues = checkLocaleParity({
      'zh-Hans': { born: '{{year}} 年出生' },
      en: { born: 'Born in {{year}}' },
    });
    expect(issues).toEqual([]);
  });

  it('reports missing keys in both directions, empty text and placeholder drift', () => {
    const issues = checkLocaleParity({
      'zh-Hans': { born: '{{year}} 年出生', died: '{{age}} 岁去世', note: ' ' },
      en: { born: 'Born in {{yaer}}', note: 'Note', extra: 'Only in English' },
    });
    expect(issues).toEqual([
      { kind: 'empty-message', locale: 'zh-Hans', key: 'note' },
      {
        kind: 'placeholder-mismatch',
        locale: 'en',
        key: 'born',
        expected: ['year'],
        actual: ['yaer'],
      },
      { kind: 'missing-key', locale: 'en', key: 'died' },
      { kind: 'missing-key', locale: 'zh-Hans', key: 'extra' },
    ]);
  });
});
