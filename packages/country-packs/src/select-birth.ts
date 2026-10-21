import {
  BIRTH_REGION_IDS,
  isSelectableBirthYear,
  type BirthRegionId,
  type CurrencyVersion,
  type EvidenceGrade,
  type ISODate,
} from '@lifesim/content-schema';
import type { DataRegistry, LookupMethod } from '@lifesim/data-registry';
import { addDays, deriveStream, toDayNumber } from '@lifesim/simulation-core';
import { PACKS } from './packs/index.ts';
import { createPackRegistry } from './registry.ts';
import { assignmentAt, currencyAt, poolPlace } from './resolve.ts';
import type { CountryPack } from './schema.ts';

export interface BirthRequest {
  seed: string;
  region: BirthRegionId | 'random';
  year: number | 'random';
  /** 精确出生日期（测试与将来的界面使用）；给出时必须落在 year 指定的年份内。 */
  birthDate?: ISODate;
}

export interface BirthContext {
  packId: BirthRegionId;
  birthDate: ISODate;
  placeId: string;
  settlement: 'urban' | 'rural';
  adminUnitId: string;
  politicalEntityId: string;
  currency: CurrencyVersion;
  provenance: {
    /** 随机地区时各地区的出生数权重；指定地区时为 null。 */
    regionWeights: Record<BirthRegionId, number> | null;
    urbanShare: { value: number; method: LookupMethod; grade: EvidenceGrade; sourceYear: number };
  };
}

let cachedDefaultRegistry: DataRegistry | undefined;

function registryFor(
  packs: Readonly<Record<BirthRegionId, CountryPack>>,
  registry: DataRegistry | undefined,
): DataRegistry {
  if (registry) return registry;
  if (packs === PACKS) {
    cachedDefaultRegistry ??= createPackRegistry(PACKS);
    return cachedDefaultRegistry;
  }
  return createPackRegistry(packs);
}

/**
 * 按 GDD §4.3 / ADR-0005 §7 选择出生地区、日期与地点。
 *
 * 抽样顺序固定：年份、地区、城乡、日期。即使玩家指定了年份或地区，也照常消费对应的抽样，
 * 这样改变一项选择不会让其他抽样错位。
 */
export function selectBirth(
  request: BirthRequest,
  packs: Readonly<Record<BirthRegionId, CountryPack>> = PACKS,
  registry?: DataRegistry,
): BirthContext {
  const stream = deriveStream(request.seed, 'birth-selection');

  const yearDraw = stream.int(77);
  const year = request.year === 'random' ? 1950 + yearDraw : request.year;
  if (!isSelectableBirthYear(year)) {
    throw new RangeError(`Birth year ${year} is outside 1950—2026`);
  }
  if (request.birthDate !== undefined && Number(request.birthDate.slice(0, 4)) !== year) {
    throw new RangeError(`birthDate ${request.birthDate} is not inside the requested year ${year}`);
  }

  const data = registryFor(packs, registry);
  const regionDraw = stream.next();
  let regionWeights: Record<BirthRegionId, number> | null = null;
  let packId: BirthRegionId;

  if (request.region === 'random') {
    const weights = BIRTH_REGION_IDS.map((id) => {
      const result = data.lookup({ indicator: 'births', geographyId: `country:${id}`, year });
      if (result.status === 'missing') {
        throw new Error(`Cannot weight births for ${id} in ${year}: ${result.reason}`);
      }
      return [id, result.value] as const;
    });
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    if (!(total > 0)) throw new Error(`Birth weights for ${year} do not sum to a positive number`);
    regionWeights = Object.fromEntries(weights) as Record<BirthRegionId, number>;

    let cumulative = 0;
    let selected: BirthRegionId = weights[weights.length - 1]?.[0] ?? 'CN';
    for (const [id, weight] of weights) {
      cumulative += weight;
      if (regionDraw * total < cumulative) {
        selected = id;
        break;
      }
    }
    packId = selected;
  } else {
    packId = request.region;
  }

  const urbanDraw = stream.next();
  const urban = data.lookup({ indicator: 'urban-share', geographyId: `country:${packId}`, year });
  if (urban.status === 'missing') {
    throw new Error(`Cannot select settlement for ${packId} in ${year}: ${urban.reason}`);
  }
  const settlement = urbanDraw < urban.value ? 'urban' : 'rural';

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const daysInYear = toDayNumber(yearEnd) - toDayNumber(yearStart);
  const dayDraw = stream.int(daysInYear);
  const birthDate = request.birthDate ?? addDays(yearStart, dayDraw);

  const pack = packs[packId];
  if (!pack) throw new Error(`Pack ${packId} is not available`);
  const place = poolPlace(pack, settlement);
  const assignment = assignmentAt(pack, place.id, birthDate);

  return {
    packId,
    birthDate,
    placeId: place.id,
    settlement,
    adminUnitId: assignment.adminUnitId,
    politicalEntityId: assignment.politicalEntityId,
    currency: currencyAt(pack, birthDate),
    provenance: {
      regionWeights,
      urbanShare: {
        value: urban.value,
        method: urban.method,
        grade: urban.evidence.grade,
        sourceYear: urban.sourceYear,
      },
    },
  };
}
