import { describe, expect, it } from 'vitest';
import {
  checkLocaleParity,
  createTemplateNarrator,
  extractPlaceholders,
  flattenMessages,
  mergeMessageTrees,
  renderTemplate,
} from './index.ts';

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

describe('createTemplateNarrator', () => {
  const resources = {
    'zh-Hans': {
      templates: { life: { birth: '出生在{{settlement}}，余额 {{balanceMinor}}。' } },
      enums: { settlement: { urban: '城市' } },
    },
    en: {
      templates: { life: { birth: 'Born in the {{settlement}}, balance {{balanceMinor}}.' } },
      enums: { settlement: { urban: 'city' } },
    },
  };
  const fact = {
    id: 'fact:0',
    sequence: 0,
    type: 'life.birth',
    at: '1980-01-01',
    actorIds: ['char:p'],
    causeEventIds: [],
    outcomeCode: 'born',
    templateId: 'life.birth',
    evidenceIds: [],
    eventVersion: 1,
    details: { settlement: 'urban', balanceMinor: 12345 },
  };
  const narrator = createTemplateNarrator({
    resources,
    formatParam: (name, value) =>
      name.endsWith('Minor') && typeof value === 'number' ? (value / 100).toFixed(2) : undefined,
  });

  it('renders the same fact in both languages with enum labels and custom formats', () => {
    expect(narrator.render(fact, 'zh-Hans')).toBe('出生在城市，余额 123.45。');
    expect(narrator.render(fact, 'en')).toBe('Born in the city, balance 123.45.');
    expect(narrator.label('settlement', 'rural', 'en')).toBe('rural');
  });

  it('refuses facts without a template', () => {
    expect(() => narrator.render({ ...fact, templateId: 'life.unknown' }, 'en')).toThrow(
      /No en template/,
    );
  });

  it('merges resource trees and rejects text/subtree conflicts', () => {
    expect(mergeMessageTrees({ a: { b: 'x' } }, { a: { c: 'y' } })).toEqual({
      a: { b: 'x', c: 'y' },
    });
    expect(() => mergeMessageTrees({ a: 'x' }, { a: { b: 'y' } })).toThrow(/Cannot merge/);
  });
});
