import {
  resolveOn,
  type AdminUnit,
  type CurrencyVersion,
  type ISODate,
  type LocalizedName,
  type Place,
  type PlaceAssignment,
  type PoliticalEntity,
} from '@lifesim/content-schema';
import { PACK_COVERAGE_START, type CountryPack } from './schema.ts';

type PackGeography = Omit<CountryPack, 'series'>;

function assertCoverage(date: ISODate): void {
  if (date < PACK_COVERAGE_START) {
    throw new RangeError(`${date} is before the pack coverage start ${PACK_COVERAGE_START}`);
  }
}

function requirePlace(pack: PackGeography, placeId: string): Place {
  const place = pack.places.find((candidate) => candidate.id === placeId);
  if (!place) throw new Error(`Unknown place ${placeId}`);
  return place;
}

export function assignmentAt(pack: PackGeography, placeId: string, date: ISODate): PlaceAssignment {
  assertCoverage(date);
  requirePlace(pack, placeId);
  const assignment = resolveOn(
    pack.placeAssignments.filter((candidate) => candidate.placeId === placeId),
    date,
  );
  if (!assignment) throw new Error(`No assignment for ${placeId} on ${date}`);
  return assignment;
}

export function politicalEntityAt(
  pack: PackGeography,
  placeId: string,
  date: ISODate,
): PoliticalEntity {
  const assignment = assignmentAt(pack, placeId, date);
  const entity = pack.politicalEntities.find(
    (candidate) => candidate.id === assignment.politicalEntityId,
  );
  if (!entity) {
    throw new Error(
      `Unknown political entity ${assignment.politicalEntityId} for ${placeId} on ${date}`,
    );
  }
  return entity;
}

export function adminUnitAt(pack: PackGeography, placeId: string, date: ISODate): AdminUnit {
  const assignment = assignmentAt(pack, placeId, date);
  const unit = pack.adminUnits.find((candidate) => candidate.id === assignment.adminUnitId);
  if (!unit) {
    throw new Error(`Unknown admin unit ${assignment.adminUnitId} for ${placeId} on ${date}`);
  }
  return unit;
}

export function placeNameAt(pack: PackGeography, placeId: string, date: ISODate): LocalizedName {
  assertCoverage(date);
  const place = requirePlace(pack, placeId);
  const name = resolveOn(place.names, date);
  if (!name) throw new Error(`No name for ${placeId} on ${date}`);
  return name.names;
}

export function currencyAt(pack: PackGeography, date: ISODate): CurrencyVersion {
  assertCoverage(date);
  let version = pack.currency.initialVersion;
  const redenominations = pack.anchors
    .filter((anchor) => anchor.kind === 'redenomination')
    .sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : 0));
  for (const anchor of redenominations) {
    if (anchor.at <= date) version = anchor.toVersion;
  }
  return { code: pack.currency.code, version };
}

export function poolPlace(pack: PackGeography, settlement: 'urban' | 'rural'): Place {
  const kind = settlement === 'urban' ? 'other-urban' : 'other-rural';
  const place = pack.places.find((candidate) => candidate.kind === kind);
  if (!place) throw new Error(`Pack ${pack.manifest.packId} has no ${kind} place`);
  return place;
}
