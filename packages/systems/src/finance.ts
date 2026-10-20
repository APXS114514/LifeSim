import { addMinor, scaleMinor } from '@lifesim/content-schema';
import { yearOf, type EventDefinition } from '@lifesim/simulation-core';
import { currencyLabel, readMacro, type RegionModel } from './region.ts';
import { EVENT, PRIORITY, account, causes, evidenceId } from './shared.ts';

/**
 * 年度家庭收支（GDD §8.1 的最小版本）：每个生日结算过去一年。
 * 收入按当年、当前币制的工资或养老金计，支出为生活费与持续治疗费，余额可以为负（负债）。
 * 全部用整数最小货币单位。
 */
export function financeEvents(region: RegionModel): EventDefinition[] {
  const settle: EventDefinition = {
    type: EVENT.settle,
    version: 1,
    priority: PRIORITY.settle,
    handle(ctx) {
      const actor = ctx.actor(ctx.occurrence.entityId);
      const year = yearOf(ctx.at);
      const { currency } = readMacro(ctx.state);
      const { status, wageLevel } = actor.employment;

      let incomeMinor = 0;
      let incomeSource: 'wage' | 'pension' | 'none' = 'none';
      if (wageLevel && status === 'employed') {
        incomeSource = 'wage';
        incomeMinor = region.annualWageMinor(year, wageLevel, currency);
      } else if (wageLevel && status === 'retired') {
        incomeSource = 'pension';
        incomeMinor = scaleMinor(
          region.annualWageMinor(year, wageLevel, currency),
          region.rules.pensionRate,
        );
      }

      const treated = actor.health.conditions.filter((condition) => condition.treated);
      const annualTreatment = scaleMinor(
        region.treatmentCostMinor(year, currency),
        region.rules.treatmentAnnualCostShare,
      );
      const costMinor = addMinor(
        region.annualLivingCostMinor(year, actor.origin.settlement, currency),
        ...treated.map(() => annualTreatment),
      );

      const target = account(ctx.state, actor);
      target.balanceMinor = addMinor(target.balanceMinor, incomeMinor, -costMinor);

      actor.finance.lastSettlementFactId = ctx.emit({
        type: 'finance.settlement',
        outcomeCode: target.balanceMinor < 0 ? 'in-debt' : 'solvent',
        actorIds: [actor.id],
        // 收入来源（受雇、退休）或没有收入的原因（失业、未就业）都由最近的就业事实说明。
        causes: causes(
          actor.employment.lastFactId,
          ...treated.map((condition) => condition.factId),
        ),
        evidenceIds: [evidenceId(region, 'labor'), evidenceId(region, 'prices')],
        details: {
          incomeSource,
          incomeMinor,
          costMinor,
          balanceMinor: target.balanceMinor,
          currency: currencyLabel(currency),
        },
      });
    },
  };
  return [settle];
}
