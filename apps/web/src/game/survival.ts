import type { EvidenceGrade } from '@lifesim/content-schema';

/**
 * 生存曲线（M4-020）：与玩家同年同地出生的人，活到每个年龄的比例。
 *
 * 只用联合国 WPP 2024 单岁生命表（证据等级 B、男女合计）。口径是「以时期生命表逐年近似出生队列」：
 * 想活到 `a + 1` 岁，要先生存到 `a` 岁，再乘上**出生年 + a** 那一年的 `q(a)`。这既不是真正的队列
 * 生命表，也不是「当期生命表」，界面必须如实披露方法（D13 批准纳入，统计口径由维护者审查）。
 *
 * 生命表到 2100 年为止：出生年 + a 超过末年后固定取末年那一列，并把这一段标成 D 级情景
 * （`scenario-hold-last`），不与观测期混为一谈。这里是纯函数，不重新模拟、不读时钟。
 */

export type SurvivalMethod = 'period-table' | 'scenario-hold-last';

export interface SurvivalPoint {
  /** 活到几岁（0—100）。 */
  age: number;
  /** S(age)，0—1。 */
  survived: number;
  /** 产生这个点所用的生命表年份（通常 = 出生年 + age − 1；情景期固定为序列末年）。 */
  periodYear: number;
  /** 该点是否来自 WPP 的 projected 年份。 */
  projected: boolean;
  method: SurvivalMethod;
  /** 'B'（观测期）/ 'D'（情景）。 */
  grade: EvidenceGrade;
}

export interface SurvivalCurve {
  birthYear: number;
  packId: string;
  points: readonly SurvivalPoint[];
  /** 观测期与情景期里最差的等级（'A' 最好）。 */
  worstGrade: EvidenceGrade;
  /** 第一个使用情景的年龄；没有情景时为 null。 */
  scenarioFrom: number | null;
  /** 数据不足而提前结束的年龄；没有提前结束时为 null。 */
  truncatedAt: number | null;
}

export interface SurvivalLookup {
  value: number;
  grade: EvidenceGrade;
  projected: boolean;
}

/** 等级从好到差；worstGrade 取序号最大的一个。 */
const GRADE_ORDER: readonly EvidenceGrade[] = ['A', 'B', 'C', 'D'];

function worstGradeOf(points: readonly SurvivalPoint[]): EvidenceGrade {
  let worst: EvidenceGrade = 'A';
  for (const point of points) {
    if (GRADE_ORDER.indexOf(point.grade) > GRADE_ORDER.indexOf(worst)) worst = point.grade;
  }
  return worst;
}

/**
 * 按固定算法累乘生存概率（S(0) = 1）。点的 `age` 是「活到几岁」，`periodYear` 是产生这一步的
 * 生命表年份，所以 `birthYear = 1950` 时 `points[1].periodYear === 1950`、`points[2].periodYear === 1951`。
 */
export function buildSurvivalCurve(input: {
  birthYear: number;
  packId: string;
  /** 由组件从 session.region.tables.ageValue('life-table-qx', year, age) 适配而来。 */
  lookup(year: number, age: number): SurvivalLookup | null;
  /** 生命表序列的最后一年（当前数据为 2100）。 */
  seriesEndYear: number;
  maxAge?: number;
}): SurvivalCurve {
  const maxAge = input.maxAge ?? 100;
  const points: SurvivalPoint[] = [
    {
      age: 0,
      survived: 1,
      periodYear: input.birthYear,
      projected: false,
      method: 'period-table',
      grade: 'B',
    },
  ];
  let scenarioFrom: number | null = null;
  let truncatedAt: number | null = null;
  let survived = 1;

  for (let age = 0; age < maxAge; age += 1) {
    const year = input.birthYear + age;
    const scenario = year > input.seriesEndYear;
    const tableYear = scenario ? input.seriesEndYear : year;
    const lookup = input.lookup(tableYear, age);
    if (lookup === null) {
      truncatedAt = age;
      break;
    }
    if (scenario && scenarioFrom === null) scenarioFrom = age;
    survived *= 1 - lookup.value;
    points.push({
      age: age + 1,
      survived,
      periodYear: tableYear,
      projected: scenario ? true : lookup.projected,
      method: scenario ? 'scenario-hold-last' : 'period-table',
      grade: scenario ? 'D' : lookup.grade,
    });
  }

  return {
    birthYear: input.birthYear,
    packId: input.packId,
    points,
    worstGrade: worstGradeOf(points),
    scenarioFrom,
    truncatedAt,
  };
}

/** 画图用的分段：观测期用实线、情景期用虚线，缺数据时在最末点打标记。 */
export interface SurvivalChartSegments {
  /** 观测期（含 WPP 的 projected 年份，等级 B）。 */
  readonly observed: readonly SurvivalPoint[];
  /** 情景段；第一点重复观测期最后一点作为连接锚点，没有情景时为空。 */
  readonly scenario: readonly SurvivalPoint[];
  /** 数据缺口前最后一个已知点；没有缺口时为 null。 */
  readonly missingPoint: SurvivalPoint | null;
}

export function survivalChartSegments(curve: SurvivalCurve): SurvivalChartSegments {
  const observed = curve.points.filter((point) => point.method === 'period-table');
  const scenario = curve.points.filter((point) => point.method === 'scenario-hold-last');
  const anchor = observed[observed.length - 1] ?? null;
  const last = curve.points[curve.points.length - 1] ?? null;
  return {
    observed,
    scenario: anchor !== null && scenario.length > 0 ? [anchor, ...scenario] : scenario,
    missingPoint: curve.truncatedAt === null ? null : last,
  };
}
