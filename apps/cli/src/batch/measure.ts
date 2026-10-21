// 单局指标提取（M5-001）。纯函数：输入事实、快照、summarizeLife 结果与决定计数，
// 输出 LifeMetrics。不推进模拟、不读时钟、不写文件。
import type { ISODate, SimEventFact, SimulationSnapshot } from '@lifesim/content-schema';
import type { LifeSummary } from '@lifesim/systems';

/**
 * 报告口径的「隐藏事实」：年度收支不面向玩家（与 apps/cli/src/run-life.ts、
 * run-real-life.ts 以及 apps/web/e2e/smoke.spec.ts 的隐藏口径一致）。
 *
 * 「可见事实」= 除它之外的全部事实，因此**包含 NPC 事实**（M3-011 之后父母的 npc.* 事件
 * 与主角事件在同一个日志里）。不得再加别的过滤。
 */
export const HIDDEN_FACT_TYPE = 'finance.settlement';

/** 引擎枚举出来的决定数 / 其中合格选项 ≥ 2 的个数；只含主角的决定（见 batch/run.ts）。 */
export interface DecisionCounts {
  total: number;
  selectable: number;
}

export interface LifeMetrics {
  /** 在世年份数：出生年…死亡年（含两端）。 */
  years: number;
  visibleFacts: number;
  /** 没有任何可见事实的在世年份数。 */
  emptyYears: number;
  decisions: DecisionCounts;
  /** `decision.made` 事实条数：只作诊断，不得当可选决定数。 */
  decisionFacts: number;
  snapshotBytes: number;
  ageAtDeath: number | null;
  aliveAtEnd: boolean;
  /** 全部事实（含 HIDDEN_FACT_TYPE）按 type 计数。 */
  byType: Record<string, number>;
  /** 可见事实按 templateId 计数。 */
  templateCounts: Record<string, number>;
}

export interface MeasureInput {
  facts: readonly SimEventFact[];
  snapshot: SimulationSnapshot;
  summary: LifeSummary;
  /** `session.birth.birthDate`；与 summary.birthDate 相同，单列出来避免调用方再拼一次。 */
  birthDate: ISODate;
  decisions: DecisionCounts;
}

/** 是否计入「可见事实」。 */
export function isVisibleFact(fact: SimEventFact): boolean {
  return fact.type !== HIDDEN_FACT_TYPE;
}

/** ISODate 是 `YYYY-MM-DD`，年份取前 4 位。 */
function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

export function measureLife(input: MeasureInput): LifeMetrics {
  const birthYear = yearOf(input.birthDate);
  const deathDate = input.summary.deathDate;
  const endYear = deathDate === null ? yearOf(input.snapshot.at) : yearOf(deathDate);

  const byType: Record<string, number> = {};
  const templateCounts: Record<string, number> = {};
  const yearsWithVisibleFact = new Set<number>();
  let visibleFacts = 0;
  let decisionFacts = 0;

  for (const fact of input.facts) {
    byType[fact.type] = (byType[fact.type] ?? 0) + 1;
    if (fact.type === 'decision.made') decisionFacts += 1;
    if (!isVisibleFact(fact)) continue;
    visibleFacts += 1;
    yearsWithVisibleFact.add(yearOf(fact.at));
    templateCounts[fact.templateId] = (templateCounts[fact.templateId] ?? 0) + 1;
  }

  let emptyYears = 0;
  for (let year = birthYear; year <= endYear; year += 1) {
    if (!yearsWithVisibleFact.has(year)) emptyYears += 1;
  }

  return {
    years: Math.max(0, endYear - birthYear + 1),
    visibleFacts,
    emptyYears,
    decisions: { total: input.decisions.total, selectable: input.decisions.selectable },
    decisionFacts,
    snapshotBytes: Buffer.byteLength(JSON.stringify(input.snapshot), 'utf8'),
    ageAtDeath: input.summary.ageAtDeath,
    aliveAtEnd: deathDate === null,
    byType,
    templateCounts,
  };
}
