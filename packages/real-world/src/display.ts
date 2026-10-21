import type { CountryPack } from '@lifesim/country-packs';
import { placeNameAt, politicalEntityAt } from '@lifesim/country-packs';
import type { CharacterState, ISODate, Locale, PoliticalEntity } from '@lifesim/content-schema';
import { LIFE_NARRATIVE } from '@lifesim/systems';

type PooledPlaceKind = 'other-urban' | 'other-rural';

function findPlace(pack: CountryPack, placeId: string) {
  const place = pack.places.find((candidate) => candidate.id === placeId);
  if (!place) throw new Error(`Unknown place ${placeId} in pack ${pack.manifest.packId}`);
  return place;
}

function findPolity(pack: CountryPack, polityId: string) {
  const entity = pack.politicalEntities.find((candidate) => candidate.id === polityId);
  if (!entity)
    throw new Error(`Unknown political entity ${polityId} in pack ${pack.manifest.packId}`);
  return entity;
}

/** 人口池地点（其他城镇/农村）的名称里通常带现代国名；显示时改用中性说法，由政体名补充历史背景。 */
function pooledPlaceLabel(kind: PooledPlaceKind, locale: Locale): string {
  return LIFE_NARRATIVE[locale].enums.otherPlace[kind];
}

/** 按日期解析地点名。普通城市使用国家包里的时变名称；人口池地点使用中性名称。 */
export function placeLabel(
  pack: CountryPack,
  placeId: string,
  date: ISODate,
  locale: Locale,
): string {
  const place = findPlace(pack, placeId);
  if (place.kind === 'other-urban' || place.kind === 'other-rural') {
    return pooledPlaceLabel(place.kind, locale);
  }
  return placeNameAt(pack, placeId, date)[locale];
}

/** 政治实体的显示名；按 ID 解析，不依赖国家代码或硬编码的「苏联 → 俄罗斯」。 */
export function polityLabel(pack: CountryPack, polityId: string, locale: Locale): string {
  return findPolity(pack, polityId).names[locale];
}

/** 某地点在指定日期的政治实体（数据层已有的半开区间解析）。 */
export function polityAtPlace(pack: CountryPack, placeId: string, date: ISODate): PoliticalEntity {
  return politicalEntityAt(pack, placeId, date);
}

export function joinNames(names: readonly string[], locale: Locale): string {
  return names.join(locale === 'zh-Hans' ? '、' : ', ');
}

/** 「地点 + 政体」的组合显示；政体名不能省略成现代国家名。 */
export function placeWithPolity(
  pack: CountryPack,
  placeId: string,
  date: ISODate,
  locale: Locale,
): { place: string; polity: string; combined: string } {
  const place = placeLabel(pack, placeId, date, locale);
  const polity = polityAtPlace(pack, placeId, date).names[locale];
  const separator = locale === 'zh-Hans' ? '，' : ', ';
  return { place, polity, combined: place + separator + polity };
}

export interface CharacterLocationLabels {
  birth: { place: string; polity: string };
  residence: { place: string; polity: string };
  politicalEntity: string;
  citizenship: string[];
}

/**
 * 把出生地、现居地、政治归属与国籍分开显示；前三者按日期解析，国籍来自角色状态。
 */
export function describeCharacterLocations(
  pack: CountryPack,
  actor: Pick<
    CharacterState,
    'birthPlaceId' | 'birthDate' | 'currentResidenceId' | 'politicalEntityId' | 'citizenshipIds'
  >,
  today: ISODate,
  locale: Locale,
): CharacterLocationLabels {
  const birthPlace = placeLabel(pack, actor.birthPlaceId, actor.birthDate, locale);
  const birthPolity = polityAtPlace(pack, actor.birthPlaceId, actor.birthDate).names[locale];
  const residencePlace = placeLabel(pack, actor.currentResidenceId, today, locale);
  const residencePolity = polityAtPlace(pack, actor.currentResidenceId, today).names[locale];
  return {
    birth: { place: birthPlace, polity: birthPolity },
    residence: { place: residencePlace, polity: residencePolity },
    politicalEntity: polityLabel(pack, actor.politicalEntityId, locale),
    citizenship: actor.citizenshipIds.map((id) => polityLabel(pack, id, locale)),
  };
}
