import {
  type CharacterState,
  type EducationLevel,
  type LifePrinciples,
  type Origin,
  type Relationship,
} from '@lifesim/content-schema';
import { addYears, type EventContext } from '@lifesim/simulation-core';
import { readMacro, type RegionModel } from './region.ts';
import { accountIdFor, evidenceId } from './shared.ts';

/**
 * 出生家庭（M3-010）：在主角出生的同一事件里创建父母两个 Tier1 NPC。
 *
 * 这里不推进父母的生命周期（M3-011 负责），只建立可验证的初始状态：
 * 角色、账户、亲子关系与两条 family.parent 事实。
 *
 * 教育、年龄与家境使用 D 级常数：M3-009 的 RegionQueries 尚未接入，
 * 因此不能声称这些是 B 级数据；事实的 evidenceIds 指向地区的 education/population
 * 表，保持“可替换、可追溯”。
 */

const PARENT_PRINCIPLES: LifePrinciples = {
  family: 0.5,
  wealth: 0.5,
  health: 0.5,
  knowledge: 0.5,
  risk: 0.5,
  stability: 0.5,
};

function adjustResources(
  resources: Origin['familyResources'],
): readonly [Origin['familyResources'], number][] {
  if (resources === 'low')
    return [
      ['low', 0.7],
      ['middle', 0.3],
    ];
  if (resources === 'high')
    return [
      ['middle', 0.3],
      ['high', 0.7],
    ];
  return [
    ['low', 0.2],
    ['middle', 0.65],
    ['high', 0.15],
  ];
}

/** 按父母出生年给一个 D 级教育分布；不是历史统计，只用于让不同代际有可解释差异。 */
function educationWeights(year: number): readonly [EducationLevel, number][] {
  if (year < 1945) {
    return [
      ['none', 0.35],
      ['primary', 0.45],
      ['secondary', 0.18],
      ['tertiary', 0.02],
    ];
  }
  if (year < 1965) {
    return [
      ['none', 0.2],
      ['primary', 0.4],
      ['secondary', 0.32],
      ['tertiary', 0.08],
    ];
  }
  return [
    ['none', 0.08],
    ['primary', 0.27],
    ['secondary', 0.43],
    ['tertiary', 0.22],
  ];
}

function bondAround(base: number, draw: number): number {
  return Math.min(1, Math.max(0, base + (draw - 0.5) * 0.15));
}

interface CreatedParent {
  readonly actor: CharacterState;
  readonly role: 'mother' | 'father';
  readonly ageAtBirth: number;
}

function createParent(
  ctx: EventContext,
  region: RegionModel,
  protagonist: CharacterState,
  role: 'mother' | 'father',
): CreatedParent {
  const shortId = protagonist.id.replace(/^char:/, '');
  const id = `char:${shortId}:${role}`;
  const ageAtBirth = 18 + ctx.random.int(28);
  const birthDate = addYears(ctx.at, -ageAtBirth);
  const education = ctx.random.weighted(educationWeights(Number(birthDate.slice(0, 4))));
  const aptitude = ctx.random.next();
  const familyResources = ctx.random.weighted(adjustResources(protagonist.origin.familyResources));

  const actor: CharacterState = {
    id,
    tier: 'tier1',
    birthDate,
    birthPlaceId: protagonist.birthPlaceId,
    currentResidenceId: protagonist.currentResidenceId,
    politicalEntityId: protagonist.politicalEntityId,
    citizenshipIds: [...protagonist.citizenshipIds],
    vitalStatus: { kind: 'alive' },
    lifePrinciples: PARENT_PRINCIPLES,
    origin: { settlement: protagonist.origin.settlement, familyResources },
    traits: { aptitude },
    education: { completed: education, enrolledIn: null, lastFactId: null },
    employment: {
      status: ageAtBirth >= region.rules.minimumWorkingAge ? 'employed' : 'not-in-labor-force',
      wageLevel: ageAtBirth >= region.rules.minimumWorkingAge ? education : null,
      lastFactId: null,
    },
    health: { conditions: [] },
    finance: { accountId: accountIdFor(id), lastSettlementFactId: null },
  };
  return { actor, role, ageAtBirth };
}

function relationshipFor(
  ctx: EventContext,
  protagonist: CharacterState,
  parent: CreatedParent,
): Relationship {
  const shortId = protagonist.id.replace(/^char:/, '');
  const base =
    protagonist.origin.familyResources === 'low'
      ? 0.55
      : protagonist.origin.familyResources === 'high'
        ? 0.75
        : 0.65;
  const trust = bondAround(base, ctx.random.next());
  const intimacy = bondAround(base, ctx.random.next());
  const conflict = bondAround(0.15, ctx.random.next());
  return {
    id: `rel:${shortId}:${parent.role}-child`,
    kind: 'parent-child',
    fromId: parent.actor.id,
    toId: protagonist.id,
    since: protagonist.birthDate,
    until: null,
    biological: true,
    legal: true,
    coResident: true,
    bonds: {
      [parent.actor.id]: { trust, intimacy, conflict },
      [protagonist.id]: { trust, intimacy, conflict },
    },
  };
}

/** 在 life.birth 中调用；bornFactId 必须已经存在。 */
export function createBirthFamily(
  ctx: EventContext,
  region: RegionModel,
  protagonist: CharacterState,
  bornFactId: string,
): void {
  const macro = readMacro(ctx.state);
  const parents = [
    createParent(ctx, region, protagonist, 'mother'),
    createParent(ctx, region, protagonist, 'father'),
  ];

  for (const parent of parents) {
    const { actor } = parent;
    ctx.state.actors.push(actor);
    ctx.state.householdAccounts.push({
      id: accountIdFor(actor.id),
      ownerIds: [actor.id],
      currency: macro.currency,
      balanceMinor: 0,
    });
    ctx.state.relationships.push(relationshipFor(ctx, protagonist, parent));
    ctx.emit({
      type: 'family.parent',
      outcomeCode: parent.role,
      templateId: 'family.parent',
      actorIds: [actor.id],
      causes: [bornFactId],
      evidenceIds: [evidenceId(region, 'education'), evidenceId(region, 'population')],
      details: {
        role: parent.role,
        ageAtBirth: parent.ageAtBirth,
        education: actor.education.completed,
      },
    });
  }
}
