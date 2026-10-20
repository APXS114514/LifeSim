import type {
  EducationLevel,
  ISODate,
  SimEventFact,
  SimulationSnapshot,
} from '@lifesim/content-schema';
import { MacroStateSchema } from './region.ts';

/** 一生的结构化概要，供生平报告与基准统计使用；只读事实与快照，不重新模拟。 */
export interface LifeSummary {
  birthDate: ISODate;
  deathDate: ISODate | null;
  ageAtDeath: number | null;
  causeOfDeath: string | null;
  settlement: string;
  familyResources: string;
  education: EducationLevel;
  yearsEmployed: number;
  hadChronicIllness: boolean;
  finalBalanceMinor: number;
  currency: string;
  decisions: { decision: string; option: string; decidedBy: string }[];
  factCount: number;
}

export function summarizeLife(
  snapshot: SimulationSnapshot,
  facts: readonly SimEventFact[],
): LifeSummary {
  const protagonist = snapshot.actors.find((actor) => actor.id === snapshot.activeCharacterId);
  if (!protagonist) throw new Error('Snapshot has no protagonist');
  const account = snapshot.householdAccounts.find(
    (entry) => entry.id === protagonist.finance.accountId,
  );
  const macro = MacroStateSchema.parse(snapshot.world);
  const death = facts.find((fact) => fact.type === 'life.death');
  const settlements = facts.filter((fact) => fact.type === 'finance.settlement');
  return {
    birthDate: protagonist.birthDate,
    deathDate:
      protagonist.vitalStatus.kind === 'deceased' ? protagonist.vitalStatus.deathDate : null,
    ageAtDeath: typeof death?.details?.['age'] === 'number' ? death.details['age'] : null,
    causeOfDeath: death?.outcomeCode ?? null,
    settlement: protagonist.origin.settlement,
    familyResources: protagonist.origin.familyResources,
    education: protagonist.education.completed,
    yearsEmployed: settlements.filter((fact) => fact.details?.['incomeSource'] === 'wage').length,
    hadChronicIllness: protagonist.health.conditions.length > 0,
    finalBalanceMinor: account?.balanceMinor ?? 0,
    currency: `${macro.currency.code}-${macro.currency.version}`,
    decisions: facts
      .filter((fact) => fact.type === 'decision.made')
      .map((fact) => ({
        decision: String(fact.details?.['decision']),
        option: String(fact.details?.['option']),
        decidedBy: String(fact.details?.['decidedBy']),
      })),
    factCount: facts.length,
  };
}
