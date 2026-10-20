// 在 Node 里跑完一个合成人生并打印生平（M1 验收的 headless 入口）。
//
//   pnpm life --seed demo --birth 1978-05-04 [--locale en] [--choose start-work]
//             [--principles knowledge=0.9,wealth=0.2] [--settlement rural] [--all] [--json] [--save life.json]
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  LIFE_PRINCIPLE_KEYS,
  LifePrinciplesSchema,
  type LifePrinciples,
  type Locale,
} from '@lifesim/content-schema';
import { encodeSave } from '@lifesim/save';
import { SimulationError, type PendingDecision } from '@lifesim/simulation-core';
import { DEFAULT_PRINCIPLES, createLifeSimulation, summarizeLife } from '@lifesim/systems';
import { cliArgs, formatMoney, isLocale, narrator, region } from './world.ts';

const TEXT = {
  'zh-Hans': {
    title: 'LifeSim · M1 headless 运行',
    data: `数据：合成地区 ${region.packId}（虚构）。全部数值是 D 类设计假设，不代表任何真实国家或统计。`,
    run: (seed: string, birth: string) => `种子 ${seed} · 出生 ${birth}`,
    decision: (type: string, options: string) => `重大决定 ${type}：可选 ${options}`,
    recommended: (option: string, reasons: string) =>
      `按人生原则建议 ${option}${reasons ? `（理由：${reasons}）` : ''}`,
    chosen: (option: string, how: string) => `选择 ${option}（${how}）`,
    fromFlag: '来自 --choose',
    fromPrinciples: '未指定，采用建议',
    summary: '概要：',
    lifespan: (age: number | null) => (age === null ? '尚在世' : `享年 ${age} 岁`),
    education: (level: string) => `学历：${level}`,
    employed: (years: number) => `工作 ${years} 年`,
    balance: (amount: string, currency: string) => `最终余额 ${amount}（${currency}）`,
    stats: (facts: number, ms: string) => `共 ${facts} 条事实 · 用时 ${ms} 毫秒`,
    saved: (path: string) => `存档已写入 ${path}`,
    hidden: (count: number) => `（另有 ${count} 条年度收支未显示，加 --all 查看）`,
  },
  en: {
    title: 'LifeSim · M1 headless run',
    data: `Data: synthetic region ${region.packId} (fictional). Every value is a D-grade design assumption, not a real country or statistic.`,
    run: (seed: string, birth: string) => `seed ${seed} · born ${birth}`,
    decision: (type: string, options: string) => `Major decision ${type}: options ${options}`,
    recommended: (option: string, reasons: string) =>
      `Life principles recommend ${option}${reasons ? ` (because of ${reasons})` : ''}`,
    chosen: (option: string, how: string) => `Chose ${option} (${how})`,
    fromFlag: 'from --choose',
    fromPrinciples: 'none given, following the recommendation',
    summary: 'Summary: ',
    lifespan: (age: number | null) => (age === null ? 'still alive' : `died at ${age}`),
    education: (level: string) => `education: ${level}`,
    employed: (years: number) => `${years} years in work`,
    balance: (amount: string, currency: string) => `final balance ${amount} (${currency})`,
    stats: (facts: number, ms: string) => `${facts} facts · ${ms} ms`,
    saved: (path: string) => `Save written to ${path}`,
    hidden: (count: number) => `(${count} yearly settlements hidden; add --all to show them)`,
  },
} satisfies Record<Locale, unknown>;

function parsePrinciples(text: string | undefined): LifePrinciples {
  const principles: Record<string, number> = { ...DEFAULT_PRINCIPLES };
  for (const pair of text ? text.split(',') : []) {
    const [key, value] = pair.split('=');
    if (!key || !(LIFE_PRINCIPLE_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Unknown principle "${key}". Use: ${LIFE_PRINCIPLE_KEYS.join(', ')}`);
    }
    principles[key] = Number(value);
  }
  return LifePrinciplesSchema.parse(principles);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: cliArgs(),
    options: {
      seed: { type: 'string', default: 'demo' },
      birth: { type: 'string', default: '1978-05-04' },
      settlement: { type: 'string' },
      principles: { type: 'string' },
      choose: { type: 'string' },
      locale: { type: 'string', default: 'zh-Hans' },
      all: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      save: { type: 'string' },
    },
  });
  const locale = values.locale;
  if (!isLocale(locale)) throw new Error(`--locale must be zh-Hans or en, got ${locale}`);
  if (values.settlement && values.settlement !== 'urban' && values.settlement !== 'rural') {
    throw new Error('--settlement must be urban or rural');
  }
  const text = TEXT[locale];
  const lines: string[] = [];
  /** 每个重大决定的说明，按「决定类型@日期」插回时间线中对应的决定事实之前。 */
  const decisionNotes = new Map<string, string[]>();
  const noteDecision = (pending: PendingDecision, chosen: string, how: string) => {
    const indent = ' '.repeat(pending.at.length + 2);
    const options = pending.options
      .map((option) => (option.eligible ? option.id : `${option.id}✗`))
      .join(' / ');
    const reasons = pending.recommended.reasons.join(', ');
    decisionNotes.set(`${pending.type}@${pending.at}`, [
      `${pending.at}  ${text.decision(pending.type, options)}`,
      `${indent}${text.recommended(pending.recommended.optionId, reasons)}`,
      `${indent}${text.chosen(chosen, how)}`,
    ]);
  };

  const started = performance.now();
  const simulation = createLifeSimulation({
    seed: values.seed,
    region,
    birthDate: values.birth,
    principles: parsePrinciples(values.principles),
    ...(values.settlement ? { settlement: values.settlement as 'urban' | 'rural' } : {}),
  });
  for (;;) {
    const result = simulation.advanceTo({
      targetDate: '2200-01-01',
      stopAtMajorDecision: true,
      maxWorkUnits: 100_000,
    });
    const pending = result.pendingDecision;
    if (result.stopReason !== 'major-decision' || !pending) break;
    const eligible = pending.options.filter((option) => option.eligible).map((option) => option.id);
    const fromFlag = values.choose !== undefined && eligible.includes(values.choose);
    const chosen = fromFlag && values.choose ? values.choose : pending.recommended.optionId;
    noteDecision(pending, chosen, fromFlag ? text.fromFlag : text.fromPrinciples);
    simulation.decide(pending.key, chosen);
  }
  const elapsed = (performance.now() - started).toFixed(1);

  const facts = [...simulation.facts];
  const snapshot = simulation.snapshot();
  const summary = summarizeLife(snapshot, facts);

  if (values.save) {
    const bytes = await encodeSave(
      { snapshot, facts },
      { engineVersion: snapshot.engineVersion, exportedAt: new Date().toISOString() },
    );
    writeFileSync(values.save, bytes);
  }

  if (values.json) {
    process.stdout.write(`${JSON.stringify({ seed: values.seed, summary, facts }, null, 2)}\n`);
    return;
  }

  lines.push(text.title, text.data, text.run(values.seed, values.birth), '');
  let hidden = 0;
  for (const fact of facts) {
    if (fact.type === 'decision.made') {
      lines.push(...(decisionNotes.get(`${String(fact.details?.['decision'])}@${fact.at}`) ?? []));
    }
    if (fact.type === 'finance.settlement' && !values.all) {
      hidden++;
      continue;
    }
    lines.push(`${fact.at}  ${narrator.render(fact, locale)}`);
  }
  if (hidden > 0) lines.push(text.hidden(hidden));
  lines.push(
    '',
    `${text.summary}${[
      text.lifespan(summary.ageAtDeath),
      text.education(narrator.label('level', summary.education, locale)),
      text.employed(summary.yearsEmployed),
      text.balance(
        formatMoney(summary.finalBalanceMinor, locale),
        narrator.label('currency', summary.currency, locale),
      ),
    ].join(' · ')}`,
    text.stats(facts.length, elapsed),
  );
  if (values.save) lines.push(text.saved(values.save));
  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch((error: unknown) => {
  if (error instanceof SimulationError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exitCode = 1;
});
