import {
  LIFE_PRINCIPLE_KEYS,
  type LifePrincipleKey,
  type LifePrinciples,
} from '@lifesim/content-schema';
import type { DecisionOption, PrincipleScores } from './types.ts';

/**
 * 人生原则执行器（GDD §6.2）：先排除不符合资格的选项，再按「原则权重 × 选项得分」求和，
 * 取最高分。打分不含随机成分，同样的原则与选项永远得到同样的决定；
 * 结果是否成功由后续事件的概率决定，不在这里。
 */

export function scoreOption(principles: LifePrinciples, scores: PrincipleScores): number {
  let total = 0;
  for (const key of LIFE_PRINCIPLE_KEYS) total += principles[key] * (scores[key] ?? 0);
  return total;
}

export interface PrincipledChoice {
  optionId: string;
  /** 对所选项贡献最大的（正向）价值维度，最多两个，用于可解释的决策理由。 */
  reasons: LifePrincipleKey[];
}

/** 返回 null 表示没有任何可选项。同分时取列表中靠前的选项。 */
export function chooseByPrinciples(
  principles: LifePrinciples,
  options: readonly DecisionOption[],
): PrincipledChoice | null {
  let best: { option: DecisionOption; score: number } | null = null;
  for (const option of options) {
    if (!option.eligible) continue;
    const score = scoreOption(principles, option.scores);
    if (!best || score > best.score) best = { option, score };
  }
  if (!best) return null;
  const chosen = best.option;
  const reasons = LIFE_PRINCIPLE_KEYS.map((key) => ({
    key,
    contribution: principles[key] * (chosen.scores[key] ?? 0),
  }))
    .filter((entry) => entry.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .map((entry) => entry.key);
  return { optionId: chosen.id, reasons };
}
