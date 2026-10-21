import type { BirthRegionId, ISODate } from '@lifesim/content-schema';
import { PACK_METADATA, politicalEntityAt, poolPlace } from '@lifesim/country-packs';

/**
 * 政体 → 旗帜资源。键是政治实体 ID，不是国家代码；同一实体可以按日期切换旗帜。
 * 资源均为公有领域（见 docs/FLAG_SOURCES.md），放在 apps/web/public/flags。
 */
export interface FlagVersion {
  /** 含；null 表示不设起点。 */
  readonly from: ISODate | null;
  /** 不含；null 表示不设终点。 */
  readonly to: ISODate | null;
  readonly file: string;
}

const FLAGS: Readonly<Record<string, readonly FlagVersion[]>> = {
  'polity:cn-prc': [{ from: null, to: null, file: 'cn-prc.svg' }],
  'polity:jp-japan': [{ from: null, to: null, file: 'jp-japan.svg' }],
  'polity:kp-dprk': [{ from: null, to: null, file: 'kp-dprk.svg' }],
  'polity:kr-rok': [{ from: null, to: null, file: 'kr-rok.svg' }],
  'polity:ru-russian-federation': [{ from: null, to: null, file: 'ru-russian-federation.svg' }],
  // 苏联国旗在 1955-08-19 改为带红星的版本；此前使用 1936 年版。
  'polity:ussr': [
    { from: null, to: '1955-08-19', file: 'ussr-1936.svg' },
    { from: '1955-08-19', to: null, file: 'ussr-1955.svg' },
  ],
};

function covers(version: FlagVersion, date: ISODate): boolean {
  if (version.from !== null && date < version.from) return false;
  if (version.to !== null && date >= version.to) return false;
  return true;
}

/** 某政体在指定日期使用的旗帜文件名；未登记时返回 null（界面显示中性占位）。 */
export function flagFileFor(polityId: string, date: ISODate): string | null {
  const versions = FLAGS[polityId];
  if (!versions) return null;
  return versions.find((version) => covers(version, date))?.file ?? null;
}

/** 带部署基路径的旗帜 URL；未登记时返回 null。 */
export function flagUrlFor(polityId: string, date: ISODate): string | null {
  const file = flagFileFor(polityId, date);
  if (!file) return null;
  const base = import.meta.env.BASE_URL;
  return (base.endsWith('/') ? base : base + '/') + 'flags/' + file;
}

export function hasFlag(polityId: string): boolean {
  return FLAGS[polityId] !== undefined;
}

/**
 * 出生设置用：地区在选定年份对应的政体。
 * 通过国家包的地点/政体解析得到，不写死「苏联 → 俄罗斯」或某个现代国家代码。
 */
export function polityForRegionAt(region: BirthRegionId, date: ISODate): string {
  const pack = PACK_METADATA[region];
  const place = poolPlace(pack, 'urban').id;
  return politicalEntityAt(pack, place, date).id;
}
