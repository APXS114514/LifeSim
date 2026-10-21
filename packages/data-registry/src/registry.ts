import {
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

export class DataRegistry {
  readonly #series: StatSeries[];
  readonly #breakpoints: Breakpoint[];
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
    this.#breakpoints = (options.breakpoints ?? []).map((breakpoint) =>
      BreakpointSchema.parse(breakpoint),
    );
  }

  lookup(query: LookupQuery): LookupResult {
    const entry = this.#index.get(seriesKey(query.indicator, query.geographyId));
    if (!entry) {
      return {
        status: 'missing',
        reason: `no ${query.indicator} series for ${query.geographyId}`,
      };
    }

    const singleYear = entry.series.ageBasis === 'single-year';
    if (singleYear && (query.age === undefined || query.age === null)) {
      throw new TypeError(`${query.indicator} requires an age`);
    }
    if (!singleYear && typeof query.age === 'number') {
      throw new TypeError(`${query.indicator} does not take an age`);
    }

    const age = singleYear ? (query.age as number) : null;
    const point = entry.points.get(pointKey(query.year, age));
    if (!point) {
      const suffix = singleYear ? ` at age ${String(age)}` : '';
      return {
        status: 'missing',
        reason: `no ${query.indicator} value for ${query.geographyId} in ${query.year}${suffix}`,
      };
    }

    if (point.value === null) {
      return { status: 'missing', reason: point.missingReason };
    }

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

  get series(): readonly StatSeries[] {
    return this.#series;
  }

  get breakpoints(): readonly Breakpoint[] {
    return this.#breakpoints;
  }
}
