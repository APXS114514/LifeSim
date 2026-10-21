import { PACKS, type CountryPack } from '@lifesim/country-packs';
import type { SimEventFact } from '@lifesim/content-schema';
import { describe, expect, it } from 'vitest';
import {
  createRealNarrator,
  describeCharacterLocations,
  joinNames,
  placeLabel,
  placeWithPolity,
  polityAtPlace,
  polityLabel,
} from './index.ts';

const ru = PACKS.RU;

function birthFact(at: string, placeId: string): SimEventFact {
  return {
    id: 'fact:test-birth',
    sequence: 0,
    type: 'life.birth',
    at,
    actorIds: ['char:test'],
    causeEventIds: [],
    outcomeCode: 'born',
    templateId: 'life.birth',
    evidenceIds: ['RU/population'],
    eventVersion: 1,
    details: { place: placeId, settlement: 'rural', familyResources: 'middle' },
  };
}

describe('historical place and polity labels', () => {
  it('resolves the political entity of a place by date', () => {
    expect(polityAtPlace(ru, 'place:ru-moscow', '1980-01-01').id).toBe('polity:ussr');
    expect(polityAtPlace(ru, 'place:ru-moscow', '1992-01-01').id).toBe(
      'polity:ru-russian-federation',
    );
    expect(polityLabel(ru, 'polity:ussr', 'zh-Hans')).toBe('苏联');
    expect(polityLabel(ru, 'polity:ussr', 'en')).toBe('Soviet Union');
    expect(polityLabel(ru, 'polity:ru-russian-federation', 'zh-Hans')).toBe('俄罗斯联邦');
    expect(polityLabel(ru, 'polity:ru-russian-federation', 'en')).toBe('Russian Federation');
  });

  it('renames Leningrad on the exact date and keeps a neutral pooled place label', () => {
    expect(placeLabel(ru, 'place:ru-saint-petersburg', '1991-09-05', 'zh-Hans')).toBe('列宁格勒');
    expect(placeLabel(ru, 'place:ru-saint-petersburg', '1991-09-06', 'zh-Hans')).toBe('圣彼得堡');
    expect(placeLabel(ru, 'place:ru-other-rural', '1980-05-04', 'zh-Hans')).toBe('其他农村地区');
    expect(placeLabel(ru, 'place:ru-other-rural', '1980-05-04', 'en')).toBe('other rural areas');
  });

  it('combines place and polity without hardcoding a country', () => {
    expect(placeWithPolity(ru, 'place:ru-moscow', '1980-01-01', 'zh-Hans')).toEqual({
      place: '莫斯科',
      polity: '苏联',
      combined: '莫斯科，苏联',
    });
    expect(placeWithPolity(ru, 'place:ru-moscow', '1992-01-01', 'en').combined).toBe(
      'Moscow, Russian Federation',
    );
  });

  it('separates birthplace, residence, political entity and citizenship', () => {
    const locations = describeCharacterLocations(
      ru,
      {
        birthPlaceId: 'place:ru-moscow',
        birthDate: '1980-05-04',
        currentResidenceId: 'place:ru-saint-petersburg',
        politicalEntityId: 'polity:ru-russian-federation',
        citizenshipIds: ['polity:ru-russian-federation'],
      },
      '1992-01-01',
      'zh-Hans',
    );
    expect(locations).toEqual({
      birth: { place: '莫斯科', polity: '苏联' },
      residence: { place: '圣彼得堡', polity: '俄罗斯联邦' },
      politicalEntity: '俄罗斯联邦',
      citizenship: ['俄罗斯联邦'],
    });
    expect(joinNames(locations.citizenship, 'zh-Hans')).toBe('俄罗斯联邦');
  });

  it('resolves any registered polity id, including a fixture republic', () => {
    const fixture: CountryPack = {
      ...PACKS.JP,
      politicalEntities: [
        ...PACKS.JP.politicalEntities,
        {
          id: 'polity:test-republic',
          names: { 'zh-Hans': '测试共和国', en: 'Test Republic' },
          validFrom: null,
          validTo: null,
          sourceIds: ['adr:0005'],
        },
      ],
    };
    expect(polityLabel(fixture, 'polity:test-republic', 'zh-Hans')).toBe('测试共和国');
    expect(polityLabel(fixture, 'polity:test-republic', 'en')).toBe('Test Republic');
  });

  it('throws for unknown ids instead of falling back to a modern name', () => {
    expect(() => polityLabel(ru, 'polity:missing', 'zh-Hans')).toThrow(/Unknown political entity/);
    expect(() => placeLabel(ru, 'place:missing', '1990-01-01', 'zh-Hans')).toThrow(/Unknown place/);
  });
});

describe('date-aware narrative labels', () => {
  it('uses neutral pooled place names and the name valid on the fact date', () => {
    const narrator = createRealNarrator(ru, '1980-05-04');
    expect(narrator.render(birthFact('1980-05-04', 'place:ru-other-rural'), 'zh-Hans')).toContain(
      '其他农村地区',
    );
    expect(
      narrator.render(birthFact('1980-05-04', 'place:ru-other-rural'), 'zh-Hans'),
    ).not.toContain('俄罗斯');
    expect(
      narrator.render(birthFact('1991-09-06', 'place:ru-saint-petersburg'), 'zh-Hans'),
    ).toContain('圣彼得堡');
    expect(
      narrator.render(birthFact('1991-09-05', 'place:ru-saint-petersburg'), 'zh-Hans'),
    ).toContain('列宁格勒');
  });
});
