import {
  BIRTH_REGION_IDS,
  findGaps,
  findOverlaps,
  type PlaceAssignment,
} from '@lifesim/content-schema';
import { CountryPackSchema, PACK_COVERAGE_START, type CountryPack } from './schema.ts';

function coverageStart(assignment: PlaceAssignment): string {
  return assignment.validFrom !== null && assignment.validFrom > PACK_COVERAGE_START
    ? assignment.validFrom
    : PACK_COVERAGE_START;
}

/**
 * 校验国家包。返回问题列表（空数组 = 合格）；每条问题文本都包含相关 ID。
 * 先做 schema 校验；schema 失败时只返回 schema 问题。
 */
export function validateCountryPack(pack: unknown): string[] {
  const parsed = CountryPackSchema.safeParse(pack);
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
  }

  const value: CountryPack = parsed.data;
  const problems: string[] = [];
  const packId = value.manifest.packId;
  const placeIds = new Set(value.places.map((place) => place.id));
  const adminUnitIds = new Map(value.adminUnits.map((unit) => [unit.id, unit]));
  const politicalEntityIds = new Map(value.politicalEntities.map((entity) => [entity.id, entity]));

  // 规则 1：清单与包标识一致。
  if (!(BIRTH_REGION_IDS as readonly string[]).includes(packId)) {
    problems.push(`manifest.packId ${packId} 不在首发地区中`);
  }
  if (value.manifest.role !== 'birth') {
    problems.push(`manifest ${packId} 的 role 必须是 birth`);
  }
  if (value.manifest.validFrom !== PACK_COVERAGE_START) {
    problems.push(`manifest ${packId} 的 validFrom 必须是 ${PACK_COVERAGE_START}`);
  }
  const expectedGeography = `country:${packId}`;
  if (value.geographyId !== expectedGeography) {
    problems.push(`geographyId ${value.geographyId} 必须是 ${expectedGeography}`);
  }

  // 规则 2：实体 ID 全局唯一。
  const seenIds = new Set<string>();
  for (const id of [
    ...value.politicalEntities.map((entity) => entity.id),
    ...value.adminUnits.map((unit) => unit.id),
    ...value.places.map((place) => place.id),
  ]) {
    if (seenIds.has(id)) problems.push(`实体 ID 重复：${id}`);
    seenIds.add(id);
  }

  // 规则 3：恰好一个其他城镇与一个其他农村人口池。
  const otherUrban = value.places.filter((place) => place.kind === 'other-urban');
  const otherRural = value.places.filter((place) => place.kind === 'other-rural');
  if (otherUrban.length !== 1) {
    problems.push(`${packId} 必须恰好有一个 other-urban 地点，实际 ${otherUrban.length} 个`);
  }
  if (otherRural.length !== 1) {
    problems.push(`${packId} 必须恰好有一个 other-rural 地点，实际 ${otherRural.length} 个`);
  }

  // 规则 4：归属引用的地点必须存在。
  for (const assignment of value.placeAssignments) {
    if (!placeIds.has(assignment.placeId)) {
      problems.push(`地点归属引用了不存在的地点：${assignment.placeId}`);
    }
  }

  // 规则 5：每个地点在 [START, ∞) 上无重叠、无空隙。
  for (const place of value.places) {
    const assignments = value.placeAssignments.filter(
      (assignment) =>
        assignment.placeId === place.id &&
        (assignment.validTo === null || assignment.validTo > PACK_COVERAGE_START),
    );
    for (const [left, right] of findOverlaps(assignments)) {
      problems.push(`地点 ${place.id} 的归属 ${left} 与 ${right} 重叠`);
    }
    const gaps = findGaps(assignments, PACK_COVERAGE_START, null);
    if (gaps.length > 0) {
      problems.push(
        `地点 ${place.id} 的归属有空隙：${gaps
          .map((gap) => `${gap.from}—${gap.to ?? '∞'}`)
          .join(', ')}`,
      );
    }
  }

  // 规则 6：归属引用的行政单位与政治实体存在，且有效期覆盖归属区间。
  for (const assignment of value.placeAssignments) {
    const start = coverageStart(assignment);
    if (assignment.validTo !== null && assignment.validTo <= start) continue;
    const adminUnit = adminUnitIds.get(assignment.adminUnitId);
    if (!adminUnit) {
      problems.push(`地点归属引用了不存在的行政单位：${assignment.adminUnitId}`);
    } else {
      const coversStart = adminUnit.validFrom === null || adminUnit.validFrom <= start;
      const coversEnd =
        assignment.validTo === null
          ? adminUnit.validTo === null
          : adminUnit.validTo === null || adminUnit.validTo >= assignment.validTo;
      if (!coversStart || !coversEnd) {
        problems.push(`行政单位 ${adminUnit.id} 的有效期没有覆盖归属 ${assignment.placeId} 的区间`);
      }
    }

    const entity = politicalEntityIds.get(assignment.politicalEntityId);
    if (!entity) {
      problems.push(`地点归属引用了不存在的政治实体：${assignment.politicalEntityId}`);
    } else {
      const coversStart = entity.validFrom === null || entity.validFrom <= start;
      const coversEnd =
        assignment.validTo === null
          ? entity.validTo === null
          : entity.validTo === null || entity.validTo >= assignment.validTo;
      if (!coversStart || !coversEnd) {
        problems.push(`政治实体 ${entity.id} 的有效期没有覆盖归属 ${assignment.placeId} 的区间`);
      }
    }
  }

  // 规则 7：每个地点的名称在 [START, ∞) 上无重叠、无空隙。
  for (const place of value.places) {
    for (const [left, right] of findOverlaps(place.names)) {
      problems.push(`地点 ${place.id} 的名称时段 ${left} 与 ${right} 重叠`);
    }
    const gaps = findGaps(place.names, PACK_COVERAGE_START, null);
    if (gaps.length > 0) {
      problems.push(
        `地点 ${place.id} 的名称有空隙：${gaps
          .map((gap) => `${gap.from}—${gap.to ?? '∞'}`)
          .join(', ')}`,
      );
    }
  }

  // 规则 8：锚点适用于本包，且类型只能是币制重定值或政体更替。
  for (const anchor of value.anchors) {
    if (!anchor.regionIds.includes(packId)) {
      problems.push(`锚点 ${anchor.id} 的 regionIds 不包含 ${packId}`);
    }
    if (anchor.kind !== 'redenomination' && anchor.kind !== 'polity-change') {
      problems.push(`锚点 ${anchor.id} 的类型 ${anchor.kind} 不允许出现在 M2 国家包中`);
    }
  }

  // 规则 9：币制重定值形成链，版本名齐全。
  const redenominations = value.anchors
    .filter((anchor) => anchor.kind === 'redenomination')
    .sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : 0));
  if (!value.currency.versionNames[String(value.currency.initialVersion)]) {
    problems.push(
      `货币 ${value.currency.code} 缺少初始版本 ${value.currency.initialVersion} 的名称`,
    );
  }
  let expectedVersion = value.currency.initialVersion;
  for (const anchor of redenominations) {
    if (anchor.currencyCode !== value.currency.code) {
      problems.push(`锚点 ${anchor.id} 的 currencyCode 必须是 ${value.currency.code}`);
    }
    if (anchor.fromVersion !== expectedVersion) {
      problems.push(
        `锚点 ${anchor.id} 的 fromVersion 应为 ${expectedVersion}，实际 ${anchor.fromVersion}`,
      );
    }
    if (!value.currency.versionNames[String(anchor.toVersion)]) {
      problems.push(`货币 ${value.currency.code} 缺少版本 ${anchor.toVersion} 的名称`);
    }
    expectedVersion = anchor.toVersion;
  }

  // 规则 10：政体更替锚点引用存在的实体，且有效期在锚点日切换。
  for (const anchor of value.anchors) {
    if (anchor.kind !== 'polity-change') continue;
    const from = politicalEntityIds.get(anchor.fromEntityId);
    const to = politicalEntityIds.get(anchor.toEntityId);
    if (!from) problems.push(`锚点 ${anchor.id} 引用了不存在的政治实体：${anchor.fromEntityId}`);
    if (!to) problems.push(`锚点 ${anchor.id} 引用了不存在的政治实体：${anchor.toEntityId}`);
    if (from && from.validTo !== anchor.at) {
      problems.push(
        `锚点 ${anchor.id} 的 fromEntityId ${from.id} 的 validTo 必须等于 ${anchor.at}`,
      );
    }
    if (to && to.validFrom !== anchor.at) {
      problems.push(`锚点 ${anchor.id} 的 toEntityId ${to.id} 的 validFrom 必须等于 ${anchor.at}`);
    }
  }

  // 规则 11：覆盖期内结束的被引用政治实体必须有对应的政体更替锚点。
  const referencedEntities = new Set(
    value.placeAssignments.map((assignment) => assignment.politicalEntityId),
  );
  for (const entity of value.politicalEntities) {
    if (entity.validTo === null || entity.validTo <= PACK_COVERAGE_START) continue;
    if (!referencedEntities.has(entity.id)) continue;
    const hasAnchor = value.anchors.some(
      (anchor) =>
        anchor.kind === 'polity-change' &&
        anchor.fromEntityId === entity.id &&
        anchor.at === entity.validTo,
    );
    if (!hasAnchor) {
      problems.push(`政治实体 ${entity.id} 在 ${entity.validTo} 结束，但没有对应的政体更替锚点`);
    }
  }

  // 规则 12：断点只适用于本包或本包地点。
  for (const breakpoint of value.breakpoints) {
    for (const geographyId of breakpoint.geographyIds) {
      if (geographyId !== value.geographyId && !placeIds.has(geographyId)) {
        problems.push(`断点 ${breakpoint.id} 引用了本包之外的地理单位：${geographyId}`);
      }
    }
  }

  // 规则 13：序列的地理单位与唯一性、ID 归属。
  const seenSeries = new Set<string>();
  for (const series of value.series) {
    if (series.geographyId !== value.geographyId && !placeIds.has(series.geographyId)) {
      problems.push(`序列 ${series.id} 引用了本包之外的地理单位：${series.geographyId}`);
    }
    const key = `${series.indicator}|${series.geographyId}`;
    if (seenSeries.has(key)) {
      problems.push(`序列 ${series.id} 与另一条序列的（指标、地理）重复：${key}`);
    }
    seenSeries.add(key);
    if (!series.id.includes(`/${packId}/`)) {
      problems.push(`序列 ${series.id} 的 ID 必须包含 /${packId}/`);
    }
  }

  return problems;
}
