/** Original zh-Hans and en writing for this project; no text copied from 1in8b or 1injp. */
import { isISODate, type ISODate } from '@lifesim/content-schema';

export const REFLECTION_NODES = Object.freeze([5, 15, 30, 50, 70] as const);
export type ReflectionNode = (typeof REFLECTION_NODES)[number];
export const REFLECTION_NOTE_MAX = 60;
interface ReflectionQuestion {
  readonly node: ReflectionNode;
  readonly question: Readonly<Record<'zh-Hans' | 'en', string>>;
  readonly options: readonly {
    readonly id: string;
    readonly label: Readonly<Record<'zh-Hans' | 'en', string>>;
  }[];
}
const questions: ReflectionQuestion[] = [
  {
    node: 5,
    question: {
      'zh-Hans': '五岁了。这一年，你最常待在哪里？',
      en: 'You are five. Where did you spend most of this year?',
    },
    options: [
      {
        id: 'home',
        label: {
          'zh-Hans': '家里',
          en: 'At home',
        },
      },
      {
        id: 'outside',
        label: {
          'zh-Hans': '家门外',
          en: 'Outside the house',
        },
      },
      {
        id: 'with-adults',
        label: {
          'zh-Hans': '跟着大人身边',
          en: 'Wherever the grown-ups went',
        },
      },
    ],
  },
  {
    node: 15,
    question: {
      'zh-Hans': '十五岁。这一年，你在为什么花力气？',
      en: 'You are fifteen. What did you put your effort into this year?',
    },
    options: [
      {
        id: 'study',
        label: {
          'zh-Hans': '念书',
          en: 'Studying',
        },
      },
      {
        id: 'work',
        label: {
          'zh-Hans': '帮家里做事',
          en: 'Helping at home or working',
        },
      },
      {
        id: 'friends',
        label: {
          'zh-Hans': '和同龄人一起',
          en: 'Being with friends',
        },
      },
    ],
  },
  {
    node: 30,
    question: {
      'zh-Hans': '三十岁。回头看这些年，你哪里变了？',
      en: 'You are thirty. Looking back, what changed in you?',
    },
    options: [
      {
        id: 'careful',
        label: {
          'zh-Hans': '变得更谨慎了',
          en: 'I became more careful',
        },
      },
      {
        id: 'bolder',
        label: {
          'zh-Hans': '变得更敢试了',
          en: 'I became more willing to try',
        },
      },
      {
        id: 'same',
        label: {
          'zh-Hans': '说不上来',
          en: "I can't say",
        },
      },
    ],
  },
  {
    node: 50,
    question: {
      'zh-Hans': '五十岁。这一年，你想把力气花在哪？',
      en: 'You are fifty. Where did you want your effort to go?',
    },
    options: [
      {
        id: 'work',
        label: {
          'zh-Hans': '把活干好',
          en: 'Doing the work well',
        },
      },
      {
        id: 'family',
        label: {
          'zh-Hans': '把家照顾好',
          en: 'Taking care of the family',
        },
      },
      {
        id: 'self',
        label: {
          'zh-Hans': '留一点给自己',
          en: 'Keeping something for myself',
        },
      },
    ],
  },
  {
    node: 70,
    question: {
      'zh-Hans': '七十岁。想对年轻时的自己说句什么？',
      en: 'You are seventy. What would you say to your younger self?',
    },
    options: [
      {
        id: 'slow',
        label: {
          'zh-Hans': '别着急',
          en: "Don't rush",
        },
      },
      {
        id: 'fearless',
        label: {
          'zh-Hans': '别怕',
          en: "Don't be afraid",
        },
      },
      {
        id: 'enough',
        label: {
          'zh-Hans': '这样就够了',
          en: 'This is enough',
        },
      },
    ],
  },
];
export const REFLECTION_QUESTIONS: readonly ReflectionQuestion[] = Object.freeze(
  questions.map((q) =>
    Object.freeze({
      ...q,
      question: Object.freeze(q.question),
      options: Object.freeze(
        q.options.map((o) => Object.freeze({ ...o, label: Object.freeze(o.label) })),
      ),
    }),
  ),
);

export interface ReflectionRecord {
  node: ReflectionNode;
  at: ISODate;
  option: string | null;
  note: string | null;
  status: 'answered' | 'skipped';
}
export type PlaybackState = 'paused' | 'playing' | 'awaiting-decision' | 'ended';
export interface ReflectionPrefs {
  enabled: boolean;
  skipDuringAutoPlay: boolean;
}
export type ReflectionPlan =
  | { kind: 'show'; node: ReflectionNode }
  | { kind: 'record-skipped'; node: ReflectionNode }
  | { kind: 'none' };
export function dueReflection(
  age: number,
  records: readonly ReflectionRecord[],
): ReflectionNode | null {
  return (
    REFLECTION_NODES.find(
      (node) => node <= age && !records.some((record) => record.node === node),
    ) ?? null
  );
}
export function planReflection(input: {
  age: number;
  records: readonly ReflectionRecord[];
  playback: PlaybackState;
  prefs: ReflectionPrefs;
}): ReflectionPlan {
  if (!input.prefs.enabled || input.playback === 'ended') return { kind: 'none' };
  const node = dueReflection(input.age, input.records);
  if (node === null) return { kind: 'none' };
  return {
    kind:
      input.playback === 'playing' && input.prefs.skipDuringAutoPlay ? 'record-skipped' : 'show',
    node,
  };
}
export function addReflection(
  records: readonly ReflectionRecord[],
  record: ReflectionRecord,
): readonly ReflectionRecord[] {
  if (records.some((r) => r.node === record.node)) return records;
  const note = record.note?.trim();
  const cleanedNote = note ? [...note].slice(0, REFLECTION_NOTE_MAX).join('') : null;
  const option = record.option || null;
  const cleaned = Object.freeze({
    ...record,
    option,
    note: cleanedNote,
    status: option || cleanedNote ? ('answered' as const) : ('skipped' as const),
  });
  return Object.freeze([...records, cleaned].sort((a, b) => a.node - b.node));
}
/** Optional presentation data is salvaged entry by entry and never blocks restoring a life. */
export function parseReflections(raw: unknown): ReflectionRecord[] {
  if (!Array.isArray(raw)) return [];
  let records: readonly ReflectionRecord[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const r = entry as Record<string, unknown>;
    if (
      !REFLECTION_NODES.includes(r['node'] as ReflectionNode) ||
      typeof r['at'] !== 'string' ||
      !isISODate(r['at']) ||
      (r['status'] !== 'answered' && r['status'] !== 'skipped') ||
      (r['option'] !== null && typeof r['option'] !== 'string') ||
      (r['note'] !== null && typeof r['note'] !== 'string')
    )
      continue;
    if (
      r['option'] !== null &&
      !REFLECTION_QUESTIONS.find((q) => q.node === r['node'])?.options.some(
        (o) => o.id === r['option'],
      )
    )
      continue;
    records = addReflection(records, {
      node: r['node'] as ReflectionNode,
      at: r['at'],
      option: r['option'],
      note: r['note'],
      status: r['status'],
    });
  }
  return [...records];
}
