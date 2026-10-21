import { readFileSync } from 'node:fs';
import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  REFLECTION_NODES,
  REFLECTION_QUESTIONS,
  addReflection,
  dueReflection,
  parseReflections,
  planReflection,
  type ReflectionNode,
  type ReflectionRecord,
} from './reflections.ts';
import zh from '../i18n/locales/zh-Hans.json';
import en from '../i18n/locales/en.json';

const record = (node: ReflectionNode): ReflectionRecord => ({
  node,
  at: '1990-01-01',
  option: null,
  note: null,
  status: 'skipped',
});

describe('original life reflections', () => {
  it('has five frozen original bilingual questions and three unranked options each', () => {
    expect(REFLECTION_NODES).toEqual([5, 15, 30, 50, 70]);
    expect(Object.isFrozen(REFLECTION_QUESTIONS)).toBe(true);
    expect(REFLECTION_QUESTIONS.map((q) => [q.node, q.question['zh-Hans'], q.question.en])).toEqual(
      [
        [
          5,
          '五岁了。这一年，你最常待在哪里？',
          'You are five. Where did you spend most of this year?',
        ],
        [
          15,
          '十五岁。这一年，你在为什么花力气？',
          'You are fifteen. What did you put your effort into this year?',
        ],
        [
          30,
          '三十岁。回头看这些年，你哪里变了？',
          'You are thirty. Looking back, what changed in you?',
        ],
        [
          50,
          '五十岁。这一年，你想把力气花在哪？',
          'You are fifty. Where did you want your effort to go?',
        ],
        [
          70,
          '七十岁。想对年轻时的自己说句什么？',
          'You are seventy. What would you say to your younger self?',
        ],
      ],
    );
    for (const q of REFLECTION_QUESTIONS) {
      expect(Object.isFrozen(q)).toBe(true);
      expect(q.options).toHaveLength(3);
      expect(new Set(q.options.map((o) => o.id)).size).toBe(3);
      for (const locale of [zh, en]) {
        expect(locale.reflection.questions[q.node]).toBe(
          q.question[locale === zh ? 'zh-Hans' : 'en'],
        );
        for (const o of q.options)
          expect((locale.reflection.options[q.node] as Record<string, string>)[o.id]).toBe(
            o.label[locale === zh ? 'zh-Hans' : 'en'],
          );
      }
    }
    expect(
      REFLECTION_QUESTIONS.flatMap((q) =>
        q.options.map((o) => [o.id, o.label['zh-Hans'], o.label.en]),
      ),
    ).toEqual([
      ['home', '家里', 'At home'],
      ['outside', '家门外', 'Outside the house'],
      ['with-adults', '跟着大人身边', 'Wherever the grown-ups went'],
      ['study', '念书', 'Studying'],
      ['work', '帮家里做事', 'Helping at home or working'],
      ['friends', '和同龄人一起', 'Being with friends'],
      ['careful', '变得更谨慎了', 'I became more careful'],
      ['bolder', '变得更敢试了', 'I became more willing to try'],
      ['same', '说不上来', "I can't say"],
      ['work', '把活干好', 'Doing the work well'],
      ['family', '把家照顾好', 'Taking care of the family'],
      ['self', '留一点给自己', 'Keeping something for myself'],
      ['slow', '别着急', "Don't rush"],
      ['fearless', '别怕', "Don't be afraid"],
      ['enough', '这样就够了', 'This is enough'],
    ]);
    expect(JSON.stringify(REFLECTION_QUESTIONS)).not.toContain('{{');
    expect(readFileSync(new URL('./reflections.ts', import.meta.url), 'utf8')).not.toMatch(
      /[\u3040-\u30ff]/,
    );
  });
  it.each([
    [0, [], null],
    [4, [], null],
    [5, [], 5],
    [5, [5], null],
    [16, [5], 15],
    [30, [5, 15], 30],
    [30, [5, 15, 30], null],
    [71, [], 5],
  ] as const)('finds first unrecorded attained node at age %s', (age, nodes, expected) => {
    expect(
      dueReflection(
        age,
        nodes.map((n) => record(n)),
      ),
    ).toBe(expected);
  });
  it('uses the specified plan precedence without changing records', () => {
    const input = {
      age: 15,
      records: [],
      playback: 'paused' as const,
      prefs: { enabled: true, skipDuringAutoPlay: true },
    };
    expect(planReflection(input)).toEqual({ kind: 'show', node: 5 });
    for (const playback of ['paused', 'playing', 'ended'] as const)
      expect(
        planReflection({ ...input, playback, prefs: { ...input.prefs, enabled: false } }),
      ).toEqual({ kind: 'none' });
    expect(planReflection({ ...input, playback: 'ended' })).toEqual({ kind: 'none' });
    expect(planReflection({ ...input, age: 4 })).toEqual({ kind: 'none' });
    expect(planReflection({ ...input, playback: 'playing' })).toEqual({
      kind: 'record-skipped',
      node: 5,
    });
    expect(
      planReflection({
        ...input,
        playback: 'playing',
        prefs: { ...input.prefs, skipDuringAutoPlay: false },
      }),
    ).toEqual({ kind: 'show', node: 5 });
    expect(planReflection({ ...input, playback: 'awaiting-decision' })).toEqual({
      kind: 'show',
      node: 5,
    });
  });
  it('sorts unique nodes, preserves duplicate identity, and sanitizes Unicode notes', () => {
    const records = addReflection([record(30)], { ...record(5), note: '  你好  ' });
    expect(records.map((r) => r.node)).toEqual([5, 30]);
    expect(records[0]).toMatchObject({ note: '你好', status: 'answered' });
    expect(addReflection(records, record(5))).toBe(records);
    expect(addReflection([], { ...record(5), note: '   ', status: 'answered' })[0]).toMatchObject({
      note: null,
      status: 'skipped',
    });
    expect(addReflection([], { ...record(5), note: '🌱'.repeat(61) })[0]?.note).toBe(
      '🌱'.repeat(60),
    );
  });
  it('drops damaged optional entries independently and keeps the first duplicate', () => {
    const first = { ...record(5), option: 'home', status: 'answered' as const };
    expect(parseReflections('x')).toEqual([]);
    expect(
      parseReflections([
        null,
        {},
        { ...record(5), node: 99 },
        { ...record(5), status: 'wat' },
        { ...record(5), at: '1990-02-30' },
        { ...record(5), option: 7 },
        { ...record(5), note: 7 },
        first,
        record(5),
        record(15),
      ]),
    ).toEqual([first, record(15)]);
  });
  it('never mutates input and bounds a record collection to the five nodes', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...REFLECTION_NODES)), (nodes) => {
        let records: readonly ReflectionRecord[] = [];
        for (const node of nodes) {
          const before = JSON.stringify(records);
          const next = addReflection(records, record(node));
          expect(JSON.stringify(records)).toBe(before);
          records = next;
        }
        expect(records.length).toBeLessThanOrEqual(5);
        expect(records.map((r) => r.node)).toEqual([...new Set(nodes)].sort((a, b) => a - b));
      }),
    );
  });
});

it('resolves every node-specific option through both translation resources', async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: 'zh-Hans',
    fallbackLng: false,
    resources: { 'zh-Hans': { translation: zh }, en: { translation: en } },
  });
  for (const locale of ['zh-Hans', 'en'] as const) {
    await i18n.changeLanguage(locale);
    for (const question of REFLECTION_QUESTIONS)
      for (const option of question.options)
        expect(
          i18n.getResource(
            locale,
            'translation',
            'reflection.options.' + question.node + '.' + option.id,
          ),
        ).toBe(option.label[locale]);
  }
});
