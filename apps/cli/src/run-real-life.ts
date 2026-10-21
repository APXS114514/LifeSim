// 在 Node 里跑完一个真实国家包上的可玩切片人生（M3-lite）。
//
//   pnpm life:real --region JP --year 1978 --birth 1978-05-04 [--locale en]
//                  [--choose apply-university] [--principles health=0.8] [--all] [--json]
import { parseArgs } from 'node:util';
import {
  LIFE_PRINCIPLE_KEYS,
  LifePrinciplesSchema,
  type BirthRegionId,
  type LifePrinciples,
} from '@lifesim/content-schema';
import {
  createRealLifeSimulation,
  createRealNarrator,
  formatRealMoney,
  isRealRegionId,
  realCurrencyName,
} from '@lifesim/real-world';
import { summarizeLife } from '@lifesim/systems';
import type { PendingDecision } from '@lifesim/simulation-core';
import { cliArgs, isLocale } from './world.ts';

const DEFAULT_PRINCIPLES: LifePrinciples = {
  family: 0.5,
  wealth: 0.5,
  health: 0.5,
  knowledge: 0.5,
  risk: 0.5,
  stability: 0.5,
};

function parsePrinciples(text: string | undefined): LifePrinciples {
  const principles: Record<string, number> = { ...DEFAULT_PRINCIPLES };
  for (const pair of text ? text.split(',') : []) {
    const [key, value] = pair.split('=');
    if (!key || !(LIFE_PRINCIPLE_KEYS as readonly string[]).includes(key)) {
      throw new Error('Unknown principle ' + String(key));
    }
    principles[key] = Number(value);
  }
  return LifePrinciplesSchema.parse(principles);
}

function optionLabel(option: PendingDecision['options'][number]): string {
  return option.eligible ? option.id : option.id + ' (unavailable)';
}

function main(): void {
  const { values } = parseArgs({
    args: cliArgs(),
    options: {
      seed: { type: 'string', default: 'demo-real' },
      region: { type: 'string', default: 'random' },
      year: { type: 'string', default: 'random' },
      birth: { type: 'string' },
      principles: { type: 'string' },
      choose: { type: 'string' },
      locale: { type: 'string', default: 'zh-Hans' },
      all: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });

  const locale = values.locale;
  if (!isLocale(locale)) throw new Error('--locale must be zh-Hans or en');
  const regionValue = values.region;
  if (regionValue !== 'random' && !isRealRegionId(regionValue)) {
    throw new Error('--region must be random, CN, JP, KP, KR or RU');
  }
  const region: BirthRegionId | 'random' = regionValue === 'random' ? 'random' : regionValue;
  const birthDate = values.birth;
  const year =
    birthDate !== undefined
      ? Number(birthDate.slice(0, 4))
      : values.year === 'random'
        ? 'random'
        : Number(values.year);
  if (year !== 'random' && (!Number.isInteger(year) || year < 1950 || year > 2026)) {
    throw new Error('--year must be random or 1950—2026');
  }

  const session = createRealLifeSimulation({
    seed: values.seed,
    region,
    year,
    ...(birthDate === undefined ? {} : { birthDate }),
    principles: parsePrinciples(values.principles),
  });
  const narrator = createRealNarrator(session.pack, session.birth.birthDate);
  const notes = new Map<string, string[]>();

  const noteDecision = (pending: PendingDecision, chosen: string) => {
    notes.set(pending.type + '@' + pending.at, [
      pending.at +
        '  decision ' +
        pending.type +
        ': ' +
        pending.options.map(optionLabel).join(' / '),
      '  recommended ' + pending.recommended.optionId + '; chose ' + chosen,
    ]);
  };

  for (;;) {
    const result = session.simulation.advanceTo({
      targetDate: '2200-01-01',
      stopAtMajorDecision: true,
      maxWorkUnits: 200_000,
    });
    const pending = result.pendingDecision;
    if (result.stopReason !== 'major-decision' || !pending) break;
    const eligible = pending.options.filter((option) => option.eligible).map((option) => option.id);
    const chosen =
      values.choose !== undefined && eligible.includes(values.choose)
        ? values.choose
        : pending.recommended.optionId;
    noteDecision(pending, chosen);
    session.simulation.decide(pending.key, chosen);
  }

  const facts = [...session.simulation.facts];
  const summary = summarizeLife(session.simulation.snapshot(), facts);
  const currency = summary.currency;

  if (values.json) {
    process.stdout.write(
      JSON.stringify(
        { seed: values.seed, request: session.request, birth: session.birth, summary, facts },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const lines: string[] = [];
  lines.push('LifeSim · 真实国家包可玩切片（M3-lite）', '');
  lines.push(
    '种子 ' + values.seed + ' · ' + session.birth.packId + ' · 出生 ' + session.birth.birthDate,
  );
  lines.push(
    '地点 ' +
      session.birth.placeId +
      ' · 城乡 ' +
      session.birth.settlement +
      ' · 政体 ' +
      session.birth.politicalEntityId,
  );
  lines.push('');
  let hidden = 0;
  for (const fact of facts) {
    if (fact.type === 'decision.made') {
      const key = String(fact.details?.['decision']) + '@' + fact.at;
      lines.push(...(notes.get(key) ?? []));
    }
    if (fact.type === 'finance.settlement' && !values.all) {
      hidden++;
      continue;
    }
    lines.push(fact.at + '  ' + narrator.render(fact, locale));
  }
  if (hidden > 0) lines.push('（另有 ' + hidden + ' 条年度收支未显示，加 --all 查看）');
  lines.push('');
  lines.push(
    '概要：' +
      (summary.ageAtDeath === null ? '尚在世' : '享年 ' + summary.ageAtDeath + ' 岁') +
      ' · 学历 ' +
      narrator.label('level', summary.education, locale) +
      ' · 工作 ' +
      summary.yearsEmployed +
      ' 年 · 最终余额 ' +
      formatRealMoney(summary.finalBalanceMinor, currency, locale) +
      '（' +
      realCurrencyName(session.pack, currency, locale) +
      '）',
  );
  lines.push('共 ' + facts.length + ' 条事实');
  process.stdout.write(lines.join('\n') + '\n');
}

try {
  main();
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
  process.exitCode = 1;
}
