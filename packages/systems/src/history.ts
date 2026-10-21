import { redenominateMinor, sameCurrency } from '@lifesim/content-schema';
import type { EventDefinition } from '@lifesim/simulation-core';
import { currencyLabel, readMacro, writeMacro, type RegionModel } from './region.ts';
import { EVENT, PRIORITY, evidenceId } from './shared.ts';

/**
 * 历史锚点（GDD §4.2）：按日期必然发生，宏观状态随之改变；
 * 个人后果（例如存款按新币换算）由这里按角色当时的状态结算，并记为以锚点为因的事实。
 */
export function historyEvents(region: RegionModel): EventDefinition[] {
  const anchorEvent: EventDefinition = {
    type: EVENT.anchor,
    version: 1,
    priority: PRIORITY.anchor,
    handle(ctx) {
      const anchor = region.anchors.find((candidate) => candidate.id === ctx.occurrence.payload);
      if (!anchor) throw new Error(`Unknown anchor ${JSON.stringify(ctx.occurrence.payload)}`);
      const macro = readMacro(ctx.state);
      const evidence = [anchor.id, evidenceId(region, 'history')];

      if (anchor.kind === 'polity-change') {
        // 政体更替只改政治实体与国籍，不改变居住地、账户或币制（GDD §4.2、§5）。
        const anchorFact = ctx.emit({
          type: 'history.anchor',
          outcomeCode: 'polity-change',
          templateId: 'history.polity-change',
          actorIds: [],
          evidenceIds: evidence,
          details: { from: anchor.fromEntityId, to: anchor.toEntityId },
        });
        for (const actor of ctx.state.actors) {
          if (actor.vitalStatus.kind !== 'alive') continue;
          if (actor.politicalEntityId !== anchor.fromEntityId) continue;
          actor.politicalEntityId = anchor.toEntityId;
          const seen = new Set<string>();
          actor.citizenshipIds = actor.citizenshipIds
            .map((id) => (id === anchor.fromEntityId ? anchor.toEntityId : id))
            .filter((id) => {
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            });
          ctx.emit({
            type: 'identity.polity-change',
            outcomeCode: 'changed',
            templateId: 'identity.polity-change',
            actorIds: [actor.id],
            causes: [anchorFact],
            evidenceIds: evidence,
            details: { from: anchor.fromEntityId, to: anchor.toEntityId },
          });
        }
        return;
      }

      if (anchor.kind === 'economy-phase') {
        const factId = ctx.emit({
          type: 'history.anchor',
          outcomeCode: anchor.phase,
          templateId: anchor.phase === 'recession' ? 'history.recession' : 'history.recovery',
          actorIds: [],
          evidenceIds: evidence,
          details: { anchor: anchor.id },
        });
        writeMacro(ctx.state, { ...macro, economyPhase: anchor.phase, economyPhaseFactId: factId });
        return;
      }

      const from = { code: anchor.currencyCode, version: anchor.fromVersion };
      const to = { code: anchor.currencyCode, version: anchor.toVersion };
      if (!sameCurrency(macro.currency, from)) {
        throw new Error(
          `Anchor ${anchor.id} expects ${currencyLabel(from)}, world has ${currencyLabel(macro.currency)}`,
        );
      }
      const anchorFact = ctx.emit({
        type: 'history.anchor',
        outcomeCode: 'redenomination',
        templateId: 'history.redenomination',
        actorIds: [],
        evidenceIds: evidence,
        details: { anchor: anchor.id, divisor: anchor.divisor },
      });
      writeMacro(ctx.state, { ...macro, currency: to });
      for (const account of ctx.state.householdAccounts) {
        if (!sameCurrency(account.currency, from)) continue;
        const beforeMinor = account.balanceMinor;
        account.balanceMinor = redenominateMinor(beforeMinor, anchor.divisor);
        account.currency = { ...to };
        ctx.emit({
          type: 'finance.redenominated',
          outcomeCode: 'converted',
          actorIds: [...account.ownerIds],
          causes: [anchorFact],
          evidenceIds: evidence,
          details: {
            beforeMinor,
            afterMinor: account.balanceMinor,
            fromCurrency: currencyLabel(from),
            toCurrency: currencyLabel(to),
          },
        });
      }
    },
  };
  return [anchorEvent];
}
