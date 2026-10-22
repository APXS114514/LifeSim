/**
 * M3-042 验收测试 1—25（规格：docs/tasks/M3-042.md「验收测试 §A」）。
 *
 * 夹具：`FIXTURE_REGION` 是虚构地区（见 __fixtures__/focus-region.ts），本文另外把
 * `mortalityQ` 压成 0 以获得固定长寿的人生；测试 11 的 `FIXTURE_PROTOTYPE` 也是虚构原型。
 * 真实五国的验收在 packages/real-world/src/life-events-batch.test.ts。
 */
import {
  checkJournalInvariants,
  type CharacterState,
  type ISODate,
  type SimEventFact,
} from '@lifesim/content-schema';
import {
  Simulation,
  addYears,
  ageOn,
  canonicalJson,
  deriveStream,
  yearOf,
  type EventContext,
  type ScheduleRequest,
  type SimState,
} from '@lifesim/simulation-core';
import { describe, expect, it } from 'vitest';
import { FIXTURE_REGION } from './__fixtures__/focus-region.ts';
import { LIFE_EVENT_CATALOG, lifeEventCatalog } from './life-events-catalog.ts';
import {
  addSkill,
  canAffordLivingCostShare,
  chargeLivingCostShare,
  inWindow,
  lifeEventChoiceType,
  lifeEventDisclosure,
  lifeEventType,
  scheduleLifeEventYear,
  type LifeEventPrototype,
  type LifeEventVariant,
  type PrototypeInput,
} from './life-events.ts';
import { dataPackVersions, lifeModule } from './module.ts';
import { LIFE_NARRATIVE } from './narrative.ts';
import type { RegionModel } from './region.ts';
import { EVENT, PROTAGONIST_ID } from './shared.ts';

const BIRTH: ISODate = '1960-06-01';
/** 虚构地区 + 确定性死亡率：78 岁必死，人生长度固定，测试可以断言死亡相关的口径。 */
const REGION: RegionModel = { ...FIXTURE_REGION, mortalityQ: (_year, age) => (age >= 78 ? 1 : 0) };
/** 生活费 100 万（最小单位）的虚构地区，用于测试 14 的金额。 */
const RICH_COST_REGION: RegionModel = { ...REGION, annualLivingCostMinor: () => 1_000_000 };
/** 完全没有学校教育的虚构地区，用于测试 5(c)。 */
const NO_SCHOOL_REGION: RegionModel = { ...REGION, primaryEnrollmentP: () => 0 };

const PROTOTYPE_TYPES = new Set(LIFE_EVENT_CATALOG.map((prototype) => lifeEventType(prototype.id)));
const CHOICE_TYPES = new Set(
  LIFE_EVENT_CATALOG.filter((prototype) => prototype.decision).map((prototype) =>
    lifeEventChoiceType(prototype.id),
  ),
);

function create(
  seed: string,
  options: {
    catalog?: readonly LifeEventPrototype[];
    birthDate?: ISODate;
    region?: RegionModel;
  } = {},
): Simulation {
  const region = options.region ?? REGION;
  return Simulation.create({
    seed,
    modules: [lifeModule(region, options.catalog ? { lifeEventCatalog: options.catalog } : {})],
    genesis: {
      type: EVENT.birth,
      at: options.birthDate ?? BIRTH,
      entityId: PROTAGONIST_ID,
      payload: { settlement: null, sex: null, principles: null },
    },
    activeCharacterId: PROTAGONIST_ID,
    dataPackVersions: dataPackVersions(region),
  });
}

/** 推进到死亡；所有待决事项都用推荐项（preset）结算，避免在测试里做策略。 */
function runToDeath(simulation: Simulation): void {
  for (let round = 0; round < 20_000; round += 1) {
    const result = simulation.advanceTo({
      targetDate: '2200-01-01',
      stopAtMajorDecision: true,
      maxWorkUnits: 200_000,
    });
    if (result.stopReason === 'major-decision') {
      const pending = result.pendingDecision;
      if (!pending) throw new Error('major-decision without pending');
      simulation.preset(pending.key, pending.recommended.optionId);
      continue;
    }
    if (result.stopReason === 'target-reached' || result.stopReason === 'protagonist-died') return;
    if (result.stopReason === 'work-budget-exhausted') continue;
    throw new Error('unexpected stop reason ' + result.stopReason);
  }
  throw new Error('life did not finish');
}

/** 推进到某个年龄；途中所有待决事项都用推荐项结算。 */
function advanceToAge(simulation: Simulation, age: number): void {
  for (let round = 0; round < 10_000; round += 1) {
    const result = simulation.advanceTo({
      targetDate: addYears(BIRTH, age),
      stopAtMajorDecision: true,
      maxWorkUnits: 200_000,
    });
    if (result.stopReason === 'major-decision') {
      const pending = result.pendingDecision;
      if (!pending) throw new Error('major-decision without pending');
      simulation.preset(pending.key, pending.recommended.optionId);
      continue;
    }
    if (result.stopReason === 'target-reached' || result.stopReason === 'protagonist-died') return;
    if (result.stopReason === 'work-budget-exhausted') continue;
    throw new Error('unexpected stop reason ' + result.stopReason);
  }
  throw new Error('did not reach age ' + age);
}

/** 快照的 schedulerState 是 JSON 值；这里一次性收窄成需要的形状。 */
function processedKeys(snapshot: ReturnType<Simulation['snapshot']>): readonly string[] {
  const scheduler = snapshot.schedulerState as unknown as { processedKeys?: readonly string[] };
  return scheduler.processedKeys ?? [];
}

function protagonist(simulation: Simulation): CharacterState {
  const actor = simulation.state.actors.find((candidate) => candidate.tier === 'protagonist');
  if (!actor) throw new Error('no protagonist');
  return actor;
}

function prototypeFacts(facts: readonly SimEventFact[]): SimEventFact[] {
  return facts.filter((fact) => PROTOTYPE_TYPES.has(fact.type));
}

function cloneState(state: SimState): SimState {
  return JSON.parse(canonicalJson(state)) as SimState;
}

/** 一个已经建立家庭关系的成年夹具状态（虚构数据）。 */
function adultFixture(): { state: SimState; actor: CharacterState } {
  const simulation = create('fixture-state');
  simulation.advanceTo({
    targetDate: addYears(BIRTH, 10),
    stopAtMajorDecision: false,
    maxWorkUnits: 200_000,
  });
  const state = cloneState(simulation.state);
  const actor = state.actors.find((candidate) => candidate.tier === 'protagonist');
  if (!actor) throw new Error('no protagonist');
  actor.employment.status = 'employed';
  return { state, actor };
}

interface InputOptions {
  at?: ISODate;
  year?: number;
  age?: number;
  region?: RegionModel;
  choice?: string | null;
  topic?: string | null;
}

function makeInput(
  state: SimState,
  actor: CharacterState,
  options: InputOptions = {},
): PrototypeInput {
  return {
    at: options.at ?? BIRTH,
    year: options.year ?? 2000,
    age: options.age ?? 40,
    state,
    actor,
    region: options.region ?? REGION,
    currency: { code: 'FIX', version: 1 },
    choice: options.choice ?? null,
    topic: options.topic ?? null,
  };
}

function balanceOf(state: SimState, actor: CharacterState): number {
  const record = state.householdAccounts.find((entry) => entry.id === actor.finance.accountId);
  if (!record) throw new Error('no account');
  return record.balanceMinor;
}

/** 后果允许改变的字段（测试 12、13 的白名单）。 */
function writableProjection(state: SimState, actor: CharacterState): string {
  return canonicalJson({
    stress: actor.wellbeing.stress,
    ties: actor.social.ties,
    skills: actor.skills,
    bonds: state.relationships.map((relationship) => relationship.bonds),
    balance: balanceOf(state, actor),
  });
}

/** 后果**不得**改变的字段；bonds 只保留结构（数值允许变）。 */
function frozenProjection(state: SimState, actor: CharacterState): string {
  return canonicalJson({
    employment: actor.employment,
    education: actor.education,
    vitalStatus: actor.vitalStatus,
    origin: actor.origin,
    traits: actor.traits,
    currentResidenceId: actor.currentResidenceId,
    citizenshipIds: actor.citizenshipIds,
    politicalEntityId: actor.politicalEntityId,
    finance: actor.finance,
    conditions: actor.health.conditions,
    relationships: state.relationships.map((relationship) => ({
      ...relationship,
      bonds: Object.fromEntries(Object.keys(relationship.bonds).map((key) => [key, 'masked'])),
    })),
  });
}

function variantOf(prototype: LifeEventPrototype, id: string): LifeEventVariant {
  const variant = prototype.variants.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`${prototype.id} has no variant ${id}`);
  return variant;
}

const COVERAGE = LIFE_EVENT_CATALOG.filter(
  (prototype) => prototype.coverageFloor && prototype.era.to === null,
);

function coverageAt(age: number): { count: number; sum: number; empty: number } {
  const active = COVERAGE.filter(
    (prototype) => age >= prototype.ages.from && age <= prototype.ages.to,
  );
  return {
    count: active.length,
    sum: active.reduce((total, prototype) => total + prototype.annualProbability, 0),
    empty: active.reduce((total, prototype) => total * (1 - prototype.annualProbability), 1),
  };
}

/** 记下 schedule 调用的假上下文（只给 scheduleLifeEventYear 用）。 */
function scheduledKeys(
  actor: CharacterState,
  at: ISODate,
  catalog: readonly LifeEventPrototype[] = LIFE_EVENT_CATALOG,
): string[] {
  const keys: string[] = [];
  const context = {
    at,
    schedule(request: ScheduleRequest) {
      keys.push(`${request.type}|${request.entityId}|${request.period}`);
    },
  } as unknown as EventContext;
  scheduleLifeEventYear(context, actor, ageOn(actor.birthDate, at), catalog);
  return keys.sort();
}

// --- 叙事助手（本包不能依赖 @lifesim/narrative，见完成报告「与规格的差异」） -------

type MessageTree = Readonly<Record<string, unknown>>;

function flatten(tree: MessageTree, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') flat.set(path, value);
    else if (value && typeof value === 'object') {
      for (const [nested, text] of flatten(value as MessageTree, path)) flat.set(nested, text);
    }
  }
  return flat;
}

const PLACEHOLDER = /\{\{([A-Za-z0-9_]+)\}\}/g;

function placeholders(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) if (match[1]) names.add(match[1]);
  return [...names].sort();
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function templateAt(locale: 'zh-Hans' | 'en', templateId: string): string {
  const flat = flatten(LIFE_NARRATIVE[locale]);
  const template = flat.get(`templates.${templateId}`);
  if (template === undefined) throw new Error(`missing template ${locale}:${templateId}`);
  return template;
}

function render(
  locale: 'zh-Hans' | 'en',
  templateId: string,
  details: Record<string, unknown>,
): string {
  const flat = flatten(LIFE_NARRATIVE[locale]);
  return templateAt(locale, templateId).replace(PLACEHOLDER, (whole, name: string) => {
    const value = details[name];
    if (value === undefined) return whole;
    const label = flat.get(`enums.${name}.${asText(value)}`);
    return label ?? asText(value);
  });
}

describe('M3-042 life event prototypes', () => {
  it('1. catalogue: exactly the twenty approved prototypes', () => {
    const expected = [
      'daily-routine',
      'early-childhood',
      'family-time',
      'first-playmate',
      'first-steps',
      'first-words',
      'friend-contact',
      'great-age-days',
      'hobby-found',
      'household-affairs',
      'learn-skill',
      'minor-mishap',
      'neighborhood-play',
      'old-age-reflection',
      'rest-and-recover',
      'retired-days',
      'reunion',
      'school-days',
      'teen-life',
      'write-letters',
    ].sort();
    expect(
      lifeEventCatalog()
        .map((prototype) => prototype.id)
        .sort(),
    ).toEqual(expected);
    for (const prototype of lifeEventCatalog()) {
      expect((prototype as unknown as { type?: string }).type).toBeUndefined();
      expect(lifeEventType(prototype.id)).toBe(`life.${prototype.id}`);
    }
  });

  it('2. catalogue: every parameter inside the approved ranges', () => {
    for (const prototype of lifeEventCatalog()) {
      expect(prototype.annualProbability).toBeGreaterThan(0);
      expect(prototype.annualProbability).toBeLessThanOrEqual(1);
      expect(prototype.ages.from).toBeGreaterThanOrEqual(1);
      expect(prototype.ages.from).toBeLessThanOrEqual(prototype.ages.to);
      expect(prototype.ages.to).toBeLessThanOrEqual(105);
      expect(prototype.era.from).toBeGreaterThanOrEqual(1950);
      if (prototype.era.to !== null)
        expect(prototype.era.to).toBeGreaterThanOrEqual(prototype.era.from);
      expect(prototype.lifetimeCap).toBeGreaterThanOrEqual(1);
      if (prototype.coverageFloor) expect(prototype.eligible).toBeUndefined();
      if (prototype.decision) expect(prototype.decision.major).toBe(false);
      expect(prototype.variants.length).toBeGreaterThanOrEqual(1);
      const ids = prototype.variants.map((variant) => variant.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('3. coverage: empty-year probability never above 0.09', () => {
    let worst = 0;
    for (let age = 1; age <= 105; age += 1) worst = Math.max(worst, coverageAt(age).empty);
    expect(worst).toBeLessThanOrEqual(0.09);
    expect(coverageAt(6).empty).toBeCloseTo(0.0392, 10);
    expect(coverageAt(25).empty).toBeCloseTo(0.0486, 10);
  });

  it('4. coverage: mean at least 1.5 and at least three prototypes every year', () => {
    let total = 0;
    for (let age = 1; age <= 105; age += 1) {
      const coverage = coverageAt(age);
      expect(coverage.count).toBeGreaterThanOrEqual(3);
      total += coverage.sum;
    }
    const mean = total / 105;
    expect(mean).toBeGreaterThanOrEqual(1.5);
    expect(mean).toBeCloseTo(1.983, 2);
  });

  it('5. eligibility: scheduling ignores state; only flavour prototypes gate on state', () => {
    const first = create('schedule-a');
    first.advanceTo({
      targetDate: addYears(BIRTH, 12),
      stopAtMajorDecision: true,
      maxWorkUnits: 200_000,
    });
    const second = create('schedule-b');
    second.advanceTo({
      targetDate: addYears(BIRTH, 12),
      stopAtMajorDecision: true,
      maxWorkUnits: 200_000,
    });
    const a = protagonist(first);
    const b = protagonist(second);
    expect(canonicalJson(a)).not.toBe(canonicalJson(b));
    const at = addYears(BIRTH, 12);
    expect(scheduledKeys(a, at)).toEqual(scheduledKeys(b, at));

    for (const prototype of lifeEventCatalog()) {
      if (prototype.coverageFloor) expect(prototype.eligible).toBeUndefined();
    }

    const noSchool = create('no-school', { region: NO_SCHOOL_REGION });
    runToDeath(noSchool);
    const owner = protagonist(noSchool);
    expect(owner.education.completed).toBe('none');
    expect(noSchool.facts.filter((fact) => fact.type.startsWith('life.reunion.'))).toHaveLength(0);
    expect(scheduledKeys(owner, addYears(BIRTH, 30))).toContain(
      `life.reunion|${PROTAGONIST_ID}|year:1990`,
    );
  }, 120_000);

  it('6. gender: no prototype reads sex', () => {
    type InputHasSex = 'sex' extends keyof PrototypeInput ? true : false;
    const inputHasSex: InputHasSex = false;
    expect(inputHasSex).toBe(false);
    expect(JSON.stringify(lifeEventCatalog())).not.toContain('"sex"');
    expect(JSON.stringify(lifeEventDisclosure(lifeEventCatalog()))).not.toContain('"sex"');
  });

  it('7. ages: never outside [from, to]', () => {
    for (const prototype of lifeEventCatalog()) {
      for (let index = 0; index < 40; index += 1) {
        const simulation = create(`age-${prototype.id}-${index}`);
        runToDeath(simulation);
        for (const fact of simulation.facts) {
          if (fact.type !== lifeEventType(prototype.id)) continue;
          const age = ageOn(BIRTH, fact.at);
          expect(age).toBeGreaterThanOrEqual(prototype.ages.from);
          expect(age).toBeLessThanOrEqual(prototype.ages.to);
        }
        for (const key of processedKeys(simulation.snapshot())) {
          if (!key.startsWith(`${lifeEventType(prototype.id)}|`)) continue;
          const year = Number(/^year:(\d+)/.exec(key.split('|')[2] ?? '')?.[1]);
          const age = year - 1960;
          expect(age).toBeGreaterThanOrEqual(prototype.ages.from);
          expect(age).toBeLessThanOrEqual(prototype.ages.to);
        }
      }
    }
  }, 120_000);

  it('8. eras: prototype level windows', () => {
    for (const birthYear of [1950, 1970, 1990, 2020]) {
      for (const prototype of lifeEventCatalog()) {
        for (let index = 0; index < 10; index += 1) {
          const birthDate = `${birthYear}-06-01`;
          const simulation = create(`era-${birthYear}-${prototype.id}-${index}`, { birthDate });
          runToDeath(simulation);
          for (const fact of simulation.facts) {
            if (fact.type !== lifeEventType(prototype.id)) continue;
            const year = yearOf(fact.at);
            expect(year).toBeGreaterThanOrEqual(prototype.era.from);
            if (prototype.era.to !== null) expect(year).toBeLessThanOrEqual(prototype.era.to);
          }
        }
      }
      if (birthYear === 1990) {
        for (let index = 0; index < 10; index += 1) {
          const simulation = create(`era-1990-letters-${index}`, { birthDate: '1990-06-01' });
          runToDeath(simulation);
          expect(
            simulation.facts.filter((fact) => fact.type.startsWith('life.write-letters.')),
          ).toHaveLength(0);
        }
      }
    }
  }, 180_000);

  it('9. eras: variant level windows', () => {
    const learn = LIFE_EVENT_CATALOG.find((prototype) => prototype.id === 'learn-skill');
    expect(learn?.topics?.find((topic) => topic.id === 'abacus')?.era).toEqual({
      from: 1950,
      to: 2000,
    });
    for (let index = 0; index < 60; index += 1) {
      const simulation = create(`variant-era-${index}`);
      runToDeath(simulation);
      for (const fact of simulation.facts) {
        if (fact.type !== 'life.learn-skill' || fact.details?.['skill'] !== 'abacus') continue;
        expect(yearOf(fact.at)).toBeLessThanOrEqual(2000);
      }
      for (const fact of simulation.facts) {
        if (fact.templateId !== 'life.family-time.radio') continue;
        expect(yearOf(fact.at)).toBeLessThanOrEqual(1995);
      }
    }
  }, 180_000);

  it('10. randomness: the first draw is exactly the annual chance', () => {
    const seed = 'random-stream';
    const simulation = create(seed);
    runToDeath(simulation);
    const facts = simulation.facts;
    const occurred = new Map<string, Set<number>>();
    for (const fact of facts) {
      if (!PROTOTYPE_TYPES.has(fact.type)) continue;
      const years = occurred.get(fact.type) ?? new Set<number>();
      years.add(yearOf(fact.at));
      occurred.set(fact.type, years);
    }
    const deathYear = yearOf(facts[facts.length - 1]!.at);
    let compared = 0;
    for (const prototype of LIFE_EVENT_CATALOG) {
      if (prototype.decision || prototype.eligible) continue;
      let count = 0;
      for (let year = 1960; year <= deathYear; year += 1) {
        const age = year - 1960;
        if (!inWindow(prototype, age, year)) continue;
        if (count >= prototype.lifetimeCap) break;
        const stream = deriveStream(seed, `life.${prototype.id}|${PROTAGONIST_ID}|year:${year}`);
        const expected = stream.chance(prototype.annualProbability);
        const actual = (occurred.get(lifeEventType(prototype.id)) ?? new Set<number>()).has(year);
        expect(actual).toBe(expected);
        compared += 1;
        if (expected) count += 1;
      }
    }
    expect(compared).toBeGreaterThan(300);
  }, 120_000);

  it('11. randomness: adding a prototype does not disturb existing facts', () => {
    const fixture: LifeEventPrototype = {
      id: 'zz-fixture',
      ages: { from: 30, to: 31 },
      era: { from: 1950, to: null },
      annualProbability: 1,
      lifetimeCap: 2,
      coverageFloor: false,
      variants: [
        {
          id: 'only',
          apply(input) {
            input.actor.wellbeing.stress = 0.5;
            return {};
          },
        },
      ],
    };
    const baseline = create('fixture-extra');
    runToDeath(baseline);
    const extended = create('fixture-extra', { catalog: [...LIFE_EVENT_CATALOG, fixture] });
    runToDeath(extended);

    const strip = (facts: readonly SimEventFact[]): string => {
      const kept = facts.filter((fact) => fact.type !== lifeEventType('zz-fixture'));
      const ids = new Map(kept.map((fact, index) => [fact.id, `fact:${index}`]));
      const remapped = kept.map(
        ({ id: _id, sequence: _sequence, causeEventIds, ...rest }, index) => ({
          ...rest,
          id: `fact:${index}`,
          sequence: index,
          causeEventIds: causeEventIds.map((cause) => ids.get(cause) ?? cause),
        }),
      );
      return canonicalJson(remapped);
    };
    expect(strip(extended.facts)).toBe(strip(baseline.facts));
  }, 120_000);

  it('12. consequences: every variant writes at least one state field', () => {
    for (const prototype of LIFE_EVENT_CATALOG) {
      for (const variant of prototype.variants) {
        const { state, actor } = adultFixture();
        // 夹具初值取中值：否则负向增量在 0 处被 clamp，「写了状态」就测不出来。
        actor.wellbeing.stress = 0.5;
        actor.social.ties = 0.5;
        const topic = prototype.topics?.[0]?.id ?? null;
        const input = makeInput(state, actor, { topic, choice: null });
        const before = writableProjection(state, actor);
        variant.apply(input);
        expect(writableProjection(state, actor), `${prototype.id}.${variant.id}`).not.toBe(before);
      }
    }
  });

  it('13. consequences: only the whitelisted fields move, and they stay bounded', () => {
    for (const prototype of LIFE_EVENT_CATALOG) {
      for (const variant of prototype.variants) {
        const { state, actor } = adultFixture();
        const topic = prototype.topics?.[0]?.id ?? null;
        const input = makeInput(state, actor, { topic, choice: 'finish' });
        const frozen = frozenProjection(state, actor);
        variant.apply(input);
        expect(frozenProjection(state, actor)).toBe(frozen);
        expect(actor.wellbeing.stress).toBeGreaterThanOrEqual(0);
        expect(actor.wellbeing.stress).toBeLessThanOrEqual(1);
        expect(actor.social.ties).toBeGreaterThanOrEqual(0);
        expect(actor.social.ties).toBeLessThanOrEqual(1);
        for (const skill of actor.skills) {
          expect(skill.level).toBeGreaterThanOrEqual(0);
          expect(skill.level).toBeLessThanOrEqual(1);
        }
        for (const relationship of state.relationships) {
          for (const bond of Object.values(relationship.bonds)) {
            expect(bond.trust).toBeGreaterThanOrEqual(0);
            expect(bond.trust).toBeLessThanOrEqual(1);
            expect(bond.intimacy).toBeGreaterThanOrEqual(0);
            expect(bond.intimacy).toBeLessThanOrEqual(1);
          }
        }
      }
    }

    const mishap = LIFE_EVENT_CATALOG.find((prototype) => prototype.id === 'minor-mishap')!;
    const { state, actor } = adultFixture();
    actor.wellbeing.stress = 0.99;
    actor.social.ties = 0.99;
    variantOf(mishap, 'fall').apply(makeInput(state, actor));
    expect(actor.wellbeing.stress).toBe(1);

    const friends = LIFE_EVENT_CATALOG.find((prototype) => prototype.id === 'friend-contact')!;
    const second = adultFixture();
    second.actor.wellbeing.stress = 0.99;
    second.actor.social.ties = 0.99;
    variantOf(friends, 'meal').apply(makeInput(second.state, second.actor));
    expect(second.actor.social.ties).toBe(1);
  });

  it('14. consequences: integer money scaled by the local living cost', () => {
    const cases = [
      { prototype: 'minor-mishap', variant: 'fall', cost: 5_000 },
      { prototype: 'rest-and-recover', variant: 'holiday', cost: 30_000 },
      { prototype: 'write-letters', variant: 'sent', cost: 3_000 },
    ];
    for (const item of cases) {
      const prototype = LIFE_EVENT_CATALOG.find((candidate) => candidate.id === item.prototype)!;
      const { state, actor } = adultFixture();
      const before = balanceOf(state, actor);
      const outcome = variantOf(prototype, item.variant).apply(
        makeInput(state, actor, { region: RICH_COST_REGION }),
      );
      const after = balanceOf(state, actor);
      expect(Number.isInteger(after)).toBe(true);
      expect(before - after).toBe(item.cost);
      expect(outcome.details?.['costMinor']).toBe(item.cost);
    }

    const free: RegionModel = { ...REGION, annualLivingCostMinor: () => 0 };
    const freeCase = adultFixture();
    const freeBefore = balanceOf(freeCase.state, freeCase.actor);
    const freeOutcome = variantOf(
      LIFE_EVENT_CATALOG.find((candidate) => candidate.id === 'minor-mishap')!,
      'fall',
    ).apply(makeInput(freeCase.state, freeCase.actor, { region: free }));
    expect(freeOutcome.details?.['costMinor']).toBe(0);
    expect(balanceOf(freeCase.state, freeCase.actor)).toBe(freeBefore);

    const child = adultFixture();
    child.actor.employment.status = 'child';
    const childBefore = balanceOf(child.state, child.actor);
    variantOf(
      LIFE_EVENT_CATALOG.find((candidate) => candidate.id === 'minor-mishap')!,
      'fall',
    ).apply(makeInput(child.state, child.actor, { region: RICH_COST_REGION, age: 8 }));
    expect(balanceOf(child.state, child.actor)).toBe(childBefore);
    expect(
      canAffordLivingCostShare(
        makeInput(child.state, child.actor, { region: RICH_COST_REGION, age: 8 }),
        0.05,
      ),
    ).toBe(true);

    const negative = adultFixture();
    negative.actor.employment.status = 'employed';
    negative.state.householdAccounts.find(
      (entry) => entry.id === negative.actor.finance.accountId,
    )!.balanceMinor = -1;
    expect(
      chargeLivingCostShare(
        makeInput(negative.state, negative.actor, { region: RICH_COST_REGION }),
        0.005,
      ),
    ).toBe(5_000);
  });

  it('15. consequences: skills dedupe and cap at twelve', () => {
    const { state, actor } = adultFixture();
    actor.skills = [];
    const input = makeInput(state, actor);
    addSkill(input, 'skill:sewing', 0.3);
    expect(actor.skills).toHaveLength(1);
    const since = actor.skills[0]!.since;
    addSkill(input, 'skill:sewing', 0.6);
    expect(actor.skills).toHaveLength(1);
    expect(actor.skills[0]!.level).toBe(0.6);
    expect(actor.skills[0]!.since).toBe(since);
    addSkill(input, 'skill:sewing', 0.2);
    expect(actor.skills[0]!.level).toBe(0.6);
    for (let index = 0; index < 13; index += 1) addSkill(input, `skill:extra-${index}`, 0.1);
    expect(actor.skills).toHaveLength(12);
  });

  it('16. decisions: only asked when the event happened, and never above the cap', () => {
    const prototypeById = new Map(LIFE_EVENT_CATALOG.map((prototype) => [prototype.id, prototype]));
    for (let index = 0; index < 40; index += 1) {
      const simulation = create(`decision-${index}`);
      const asked: number[] = [];
      for (let round = 0; round < 20_000; round += 1) {
        const result = simulation.advanceTo({
          targetDate: '2200-01-01',
          stopAtMajorDecision: true,
          maxWorkUnits: 200_000,
        });
        if (result.stopReason === 'major-decision') {
          const pending = result.pendingDecision;
          if (!pending) throw new Error('major-decision without pending');
          const eligible = pending.options.filter((option) => option.eligible).length;
          asked.push(eligible);
          simulation.preset(pending.key, pending.recommended.optionId);
          continue;
        }
        if (result.stopReason === 'target-reached' || result.stopReason === 'protagonist-died')
          break;
        if (result.stopReason === 'work-budget-exhausted') continue;
        throw new Error('unexpected stop reason ' + result.stopReason);
      }
      const facts = simulation.facts;
      const count = (prefix: string) =>
        facts.filter((fact) => fact.templateId.startsWith(prefix)).length;
      expect(count('life.hobby-found.choice.')).toBe(
        facts.filter((fact) => fact.templateId === 'life.hobby-found.found').length,
      );
      expect(count('life.learn-skill.choice.')).toBe(
        facts.filter((fact) => fact.templateId === 'life.learn-skill.finished').length +
          facts.filter((fact) => fact.templateId === 'life.learn-skill.gave-up').length,
      );
      for (const prototype of prototypeById.values()) {
        const hits = facts.filter((fact) => fact.type === lifeEventType(prototype.id)).length;
        expect(hits).toBeLessThanOrEqual(prototype.lifetimeCap);
      }
      for (const eligible of asked) expect(eligible).toBeGreaterThanOrEqual(2);
    }
  }, 180_000);

  it('17. decisions: learn-skill tuition eligibility is a pure function of the balance', () => {
    const learn = LIFE_EVENT_CATALOG.find((prototype) => prototype.id === 'learn-skill')!;
    const decision = learn.decision!;
    const { state, actor } = adultFixture();
    const tuition = 0.05;
    const poor = makeInput(state, actor, { region: RICH_COST_REGION, choice: null });
    const account = state.householdAccounts.find((entry) => entry.id === actor.finance.accountId)!;
    account.balanceMinor = 0;
    const optionsPoor = decision.options(poor);
    expect(optionsPoor.find((option) => option.id === 'finish')?.eligible).toBe(false);
    expect(optionsPoor.find((option) => option.id === 'give-up')?.eligible).toBe(true);
    expect(optionsPoor.filter((option) => option.eligible)).toHaveLength(1);

    account.balanceMinor = 1_000_000;
    const optionsRich = decision.options(poor);
    expect(optionsRich.find((option) => option.id === 'finish')?.eligible).toBe(true);
    expect(optionsRich.find((option) => option.id === 'give-up')?.eligible).toBe(true);

    const before = canonicalJson(state);
    const again = decision.options(poor);
    expect(
      canonicalJson(again.map((option) => ({ id: option.id, eligible: option.eligible }))),
    ).toBe(
      canonicalJson(optionsRich.map((option) => ({ id: option.id, eligible: option.eligible }))),
    );
    expect(canonicalJson(state)).toBe(before);
    expect(tuition).toBe(0.05);
  });

  it('18. narrative: both locales, identical placeholders, renderable', () => {
    const zh = flatten(LIFE_NARRATIVE['zh-Hans']);
    const en = flatten(LIFE_NARRATIVE['en']);
    const zhKeys = [...zh.keys()].sort();
    const enKeys = [...en.keys()].sort();
    expect(zhKeys).toEqual(enKeys);

    for (const row of lifeEventDisclosure(lifeEventCatalog())) {
      for (const templateId of row.templateIds) {
        const chinese = templateAt('zh-Hans', templateId);
        const english = templateAt('en', templateId);
        expect(placeholders(chinese)).toEqual(placeholders(english));
        expect(chinese.length).toBeGreaterThan(0);
        expect(english.length).toBeGreaterThan(0);
      }
    }

    for (const prototype of LIFE_EVENT_CATALOG) {
      const merged: Record<string, unknown> = { costMinor: 12_345, currency: 'FIX' };
      const topic = prototype.topics?.[0]?.id ?? null;
      if (topic) {
        merged['hobby'] = topic;
        merged['skill'] = topic;
      }
      for (const choice of [null, ...(prototype.decision?.optionIds ?? [])]) {
        const { state, actor } = adultFixture();
        const input = makeInput(state, actor, { topic, choice });
        for (const variant of prototype.variants) {
          if (variant.when && !variant.when(input)) continue;
          Object.assign(merged, variant.apply(input).details ?? {});
        }
      }
      const row = lifeEventDisclosure([prototype])[0]!;
      for (const templateId of row.templateIds) {
        for (const locale of ['zh-Hans', 'en'] as const) {
          const text = render(locale, templateId, merged);
          expect(text.length).toBeGreaterThan(0);
          expect(text).not.toContain('{{');
        }
      }
    }
  }, 60_000);

  it('19. disclosure: one row per prototype, matching the catalogue', () => {
    const rows = lifeEventDisclosure(lifeEventCatalog());
    expect(rows).toHaveLength(20);
    rows.forEach((row, index) => {
      const prototype = LIFE_EVENT_CATALOG[index]!;
      expect(row.id).toBe(prototype.id);
      expect(row.ages).toEqual(prototype.ages);
      expect(row.era).toEqual(prototype.era);
      expect(row.annualProbability).toBe(prototype.annualProbability);
      expect(row.lifetimeCap).toBe(prototype.lifetimeCap);
      expect(row.evidenceGrade).toBe('D');
      const expected = [
        ...prototype.variants.map((variant) => `life.${prototype.id}.${variant.id}`),
        ...(prototype.decision?.optionIds ?? []).map(
          (option) => `life.${prototype.id}.choice.${option}`,
        ),
      ];
      expect(row.templateIds).toEqual(expected);
      expect(row.hasDecision).toBe(prototype.decision !== undefined);
    });
  });

  it('20. content: no names, no gendered pronouns, no sensitive words', () => {
    const chineseForbidden = /他|她|战争|暴力|自杀|杀|伤亡/;
    const englishForbidden =
      /(^|[^A-Za-z])(he|him|his|she|her|hers|war|kill|suicide|violence)([^A-Za-z]|$)/i;
    for (const row of lifeEventDisclosure(lifeEventCatalog())) {
      for (const templateId of row.templateIds) {
        for (const locale of ['zh-Hans', 'en'] as const) {
          const text = templateAt(locale, templateId);
          const stripped = text.replace(PLACEHOLDER, '');
          expect(stripped).not.toContain('{{name}}');
          expect(stripped).not.toContain('{{familyName}}');
          if (locale === 'zh-Hans') expect(chineseForbidden.test(stripped)).toBe(false);
          else expect(englishForbidden.test(stripped)).toBe(false);
        }
      }
    }
  });

  it('21. evidence: prototype facts cite no data table', () => {
    const simulation = create('evidence');
    runToDeath(simulation);
    const facts = prototypeFacts(simulation.facts);
    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) expect(fact.evidenceIds).toEqual([]);
  }, 60_000);

  it('22. determinism: same seed, and yearly steps equal one leap', () => {
    const once = create('deterministic');
    runToDeath(once);
    const twice = create('deterministic');
    runToDeath(twice);
    expect(canonicalJson(twice.facts)).toBe(canonicalJson(once.facts));

    const stepped = create('deterministic');
    for (let age = 1; age <= 110; age += 1) {
      const result = stepped.advanceTo({
        targetDate: addYears(BIRTH, age),
        stopAtMajorDecision: true,
        maxWorkUnits: 200_000,
      });
      while (result.stopReason === 'major-decision') {
        const pending = result.pendingDecision;
        if (!pending) throw new Error('major-decision without pending');
        stepped.preset(pending.key, pending.recommended.optionId);
        const next = stepped.advanceTo({
          targetDate: addYears(BIRTH, age),
          stopAtMajorDecision: true,
          maxWorkUnits: 200_000,
        });
        if (next.stopReason !== 'major-decision') break;
      }
      if (
        stepped.state.actors.find((actor) => actor.tier === 'protagonist')?.vitalStatus.kind ===
        'deceased'
      )
        break;
    }
    expect(canonicalJson(stepped.facts)).toBe(canonicalJson(once.facts));
  }, 120_000);

  it('23. snapshots: resuming mid-life matches an uninterrupted run', () => {
    const reference = create('resume');
    runToDeath(reference);
    const interrupted = create('resume');
    advanceToAge(interrupted, 40);
    const snapshot = interrupted.snapshot();
    const resumed = Simulation.restore(snapshot, {
      modules: [lifeModule(REGION)],
      dataPackVersions: dataPackVersions(REGION),
    });
    runToDeath(resumed);
    // 快照只存状态与调度器（不含事实日志，Q9）：比较的是「快照前事实 + 恢复后事实」。
    expect(canonicalJson([...interrupted.facts, ...resumed.facts])).toBe(
      canonicalJson(reference.facts),
    );
  }, 120_000);

  it('24. volume: prototype events stay under the catalogue bound', () => {
    const simulation = create('volume');
    runToDeath(simulation);
    const snapshot = simulation.snapshot();
    const deathYear = yearOf(simulation.facts[simulation.facts.length - 1]!.at);
    const deathAge = deathYear - 1960;
    let prototypeKeys = 0;
    let choiceKeys = 0;
    for (const key of processedKeys(snapshot)) {
      const type = key.split('|')[0]!;
      if (PROTOTYPE_TYPES.has(type)) prototypeKeys += 1;
      else if (CHOICE_TYPES.has(type)) choiceKeys += 1;
    }
    const bound = LIFE_EVENT_CATALOG.reduce((total, prototype) => {
      const last = Math.min(prototype.ages.to, deathAge);
      if (last < prototype.ages.from) return total;
      return total + (last - prototype.ages.from + 1);
    }, 0);
    expect(prototypeKeys).toBeLessThanOrEqual(bound);
    expect(prototypeKeys).toBeLessThanOrEqual(8 * (deathAge + 1));
    expect(choiceKeys).toBeLessThanOrEqual(prototypeKeys);
  }, 60_000);

  it('25. invariants: a whole life stays consistent', () => {
    const simulation = create('invariants');
    runToDeath(simulation);
    const facts = simulation.facts;
    expect(facts.length).toBeGreaterThan(0);
    expect(checkJournalInvariants(facts, { complete: true })).toEqual([]);
    const deathYear = yearOf(facts[facts.length - 1]!.at);
    for (const fact of facts) {
      expect(yearOf(fact.at)).toBeGreaterThanOrEqual(1960);
      expect(yearOf(fact.at)).toBeLessThanOrEqual(deathYear);
    }
    expect(protagonist(simulation).vitalStatus.kind).toBe('deceased');
  }, 60_000);
});
