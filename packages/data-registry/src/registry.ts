import {
  INDICATOR_SPEC,
  StatSeriesSchema,
  type EvidenceMeta,
  type Indicator,
  type StatSeries,
} from '@lifesim/content-schema';
import { BreakpointSchema, type Breakpoint } from './breakpoint.ts';

export interface LookupQuery {
  indicator: Indicator;
  geographyId: string;
  year: number;
  /** 单岁年龄；ageBasis 为 'none' 的指标必须省略或为 null。 */
  age?: number | null;
}

export type LookupMethod =
  | 'exact'
  | 'fallback-neighbor-year'
  | 'fallback-parent-geography'
  | 'hold-first-observed'
  | 'scenario-hold-last';

export type LookupResult =
  | {
      status: 'found';
      value: number;
      method: LookupMethod;
      seriesId: string;
      /** 实际取值的年份与地理单位（回退时与查询不同）。 */
      sourceYear: number;
      sourceGeographyId: string;
      projected: boolean;
      evidence: EvidenceMeta;
    }
  | { status: 'missing'; reason: string };

export interface RegistryOptions {
  breakpoints?: readonly Breakpoint[];
  /** 地理单位 → 上级地理单位（M2-007 使用）。 */
  parents?: Readonly<Record<string, string>>;
}

interface IndexedSeries {
  series: StatSeries;
  points: Map<string, StatSeries['points'][number]>;
}

function pointKey(year: number, age: number | null): string {
  return `${year}:${age === null ? 'null' : String(age)}`;
}

function seriesKey(indicator: Indicator, geographyId: string): string {
  return `${indicator}|${geographyId}`;
}

function copyEvidence(evidence: EvidenceMeta): EvidenceMeta {
  return JSON.parse(JSON.stringify(evidence)) as EvidenceMeta;
}

function downgradeEvidence(
  evidence: EvidenceMeta,
  method: LookupMethod,
  forceScenarioGrade = false,
): EvidenceMeta {
  const copy = copyEvidence(evidence);
  copy.grade = forceScenarioGrade || copy.grade === 'D' ? 'D' : 'C';
  copy.methodId = method;
  return copy;
}

function breakpointYear(breakpoint: Breakpoint): number {
  return Number(breakpoint.date.slice(0, 4));
}

function crossesBreakpoint(
  breakpoints: readonly Breakpoint[],
  indicator: Indicator,
  geographyId: string,
  firstYear: number,
  secondYear: number,
): boolean {
  const low = Math.min(firstYear, secondYear);
  const high = Math.max(firstYear, secondYear);
  return breakpoints.some(
    (breakpoint) =>
      breakpoint.geographyIds.includes(geographyId) &&
      breakpoint.indicators.includes(indicator) &&
      low < breakpointYear(breakpoint) &&
      breakpointYear(breakpoint) <= high,
  );
}

export class DataRegistry {
  readonly #series: StatSeries[];
  readonly #breakpoints: Breakpoint[];
  readonly #parents: Readonly<Record<string, string>>;
  readonly #index: Map<string, IndexedSeries>;

  constructor(series: readonly unknown[], options: RegistryOptions = {}) {
    const parsedSeries: StatSeries[] = [];
    this.#index = new Map();

    series.forEach((candidate, index) => {
      let parsed: StatSeries;
      try {
        parsed = StatSeriesSchema.parse(candidate);
      } catch (error) {
        const id =
          typeof candidate === 'object' && candidate !== null && 'id' in candidate
            ? String(candidate.id)
            : undefined;
        const label = id === undefined ? `index ${index}` : `index ${index} (${id})`;
        throw new Error(
          `Invalid series at ${label}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      const key = seriesKey(parsed.indicator, parsed.geographyId);
      const existing = this.#index.get(key);
      if (existing) {
        throw new Error(
          `Duplicate series for ${parsed.indicator} at ${parsed.geographyId}: ${existing.series.id} and ${parsed.id}`,
        );
      }

      const points = new Map<string, StatSeries['points'][number]>();
      for (const point of parsed.points) {
        points.set(pointKey(point.year, point.age), point);
      }
      this.#index.set(key, { series: parsed, points });
      parsedSeries.push(parsed);
    });

    this.#series = parsedSeries;
    this.#parents = options.parents ?? {};
    this.#breakpoints = (options.breakpoints ?? []).map((breakpoint) =>
      BreakpointSchema.parse(breakpoint),
    );
  }

  lookup(query: LookupQuery): LookupResult {
    const spec = INDICATOR_SPEC[query.indicator];
    const singleYear = spec.ageBasis === 'single-year';
    if (singleYear && (query.age === undefined || query.age === null)) {
      throw new TypeError(`${query.indicator} requires an age`);
    }
    if (!singleYear && typeof query.age === 'number') {
      throw new TypeError(`${query.indicator} does not take an age`);
    }
    const age = singleYear ? (query.age as number) : null;
    const ageSuffix = singleYear ? ` at age ${String(age)}` : '';

    const entry = this.#index.get(seriesKey(query.indicator, query.geographyId));
    const failures: string[] = [];
    let exactMissingReason: string | undefined;

    if (entry) {
      const point = entry.points.get(pointKey(query.year, age));
      if (point) {
        if (point.value !== null) {
          return {
            status: 'found',
            value: point.value,
            method: 'exact',
            seriesId: entry.series.id,
            sourceYear: query.year,
            sourceGeographyId: query.geographyId,
            projected: point.projected,
            evidence: copyEvidence(entry.series.evidence),
          };
        }
        exactMissingReason = point.missingReason;
        failures.push(`${query.year}${ageSuffix} is missing: ${point.missingReason}`);
      } else {
        failures.push(`no exact value for ${query.year}${ageSuffix}`);
      }

      let best: { point: StatSeries['points'][number]; distance: number } | undefined;
      for (const candidate of entry.series.points) {
        if (candidate.age !== age || candidate.value === null) continue;
        const distance = Math.abs(candidate.year - query.year);
        if (distance !== 1 && distance !== 2) continue;
        if (
          crossesBreakpoint(
            this.#breakpoints,
            query.indicator,
            query.geographyId,
            candidate.year,
            query.year,
          )
        ) {
          continue;
        }
        if (
          best === undefined ||
          distance < best.distance ||
          (distance === best.distance && candidate.year < best.point.year)
        ) {
          best = { point: candidate, distance };
        }
      }

      if (best) {
        return {
          status: 'found',
          value: best.point.value as number,
          method: 'fallback-neighbor-year',
          seriesId: entry.series.id,
          sourceYear: best.point.year,
          sourceGeographyId: query.geographyId,
          projected: best.point.projected,
          evidence: downgradeEvidence(entry.series.evidence, 'fallback-neighbor-year'),
        };
      }
      failures.push('no non-null neighbor within 2 years (breakpoint-aware)');
    } else {
      failures.push(`no ${query.indicator} series for ${query.geographyId}`);
    }

    const parent = this.#parents[query.geographyId];
    if (parent !== undefined) {
      const parentEntry = this.#index.get(seriesKey(query.indicator, parent));
      const parentPoint = parentEntry?.points.get(pointKey(query.year, age));
      if (parentEntry !== undefined && parentPoint?.value !== null && parentPoint !== undefined) {
        return {
          status: 'found',
          value: parentPoint.value,
          method: 'fallback-parent-geography',
          seriesId: parentEntry.series.id,
          sourceYear: query.year,
          sourceGeographyId: parent,
          projected: parentPoint.projected,
          evidence: downgradeEvidence(parentEntry.series.evidence, 'fallback-parent-geography'),
        };
      }
      failures.push(`parent ${parent} has no exact value for ${query.year}${ageSuffix}`);
    } else {
      failures.push('no parent geography registered');
    }

    if (entry && query.indicator === 'urban-share') {
      let first: StatSeries['points'][number] | undefined;
      for (const candidate of entry.series.points) {
        if (candidate.age !== null || candidate.value === null) continue;
        if (first === undefined || candidate.year < first.year) first = candidate;
      }
      if (first !== undefined) {
        const withinWindow = first.year - query.year <= 10;
        if (
          query.year < first.year &&
          withinWindow &&
          !crossesBreakpoint(
            this.#breakpoints,
            query.indicator,
            query.geographyId,
            query.year,
            first.year,
          )
        ) {
          return {
            status: 'found',
            value: first.value as number,
            method: 'hold-first-observed',
            seriesId: entry.series.id,
            sourceYear: first.year,
            sourceGeographyId: query.geographyId,
            projected: false,
            evidence: downgradeEvidence(entry.series.evidence, 'hold-first-observed', true),
          };
        }
        failures.push(`hold-first-observed does not apply (first observation ${first.year})`);
      } else {
        failures.push('no observed urban-share value to hold');
      }
    }

    // M2-006 的既有契约：显式缺失点在没有可回退的上级时返回该点自己的原因。
    if (exactMissingReason !== undefined && parent === undefined) {
      return { status: 'missing', reason: exactMissingReason };
    }

    // M2-006 的既有契约：没有序列且没有可回退的上级时，只说明这一件事。
    if (!entry && parent === undefined) {
      return {
        status: 'missing',
        reason: `no ${query.indicator} series for ${query.geographyId}`,
      };
    }

    return {
      status: 'missing',
      reason: `${query.indicator} ${query.geographyId} ${query.year}${ageSuffix}: ${failures.join('; ')}`,
    };
  }

  get series(): readonly StatSeries[] {
    return this.#series;
  }

  get breakpoints(): readonly Breakpoint[] {
    return this.#breakpoints;
  }
}
