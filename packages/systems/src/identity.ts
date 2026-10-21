import { yearOf, type EventDefinition } from '@lifesim/simulation-core';
import type { RegionModel } from './region.ts';
import { EVENT, PRIORITY } from './shared.ts';

/** 每人独立的命名事件；同日键序 father → mother → protagonist，先确定父姓与父名。 */
export function identityEvents(region: RegionModel): EventDefinition[] {
  return [
    {
      type: EVENT.name,
      version: 1,
      priority: PRIORITY.name,
      handle(ctx) {
        const actor = ctx.actor(ctx.occurrence.entityId);
        const request = {
          birthYear: yearOf(actor.birthDate),
          sex: actor.sex,
          settlement: actor.origin.settlement,
        };
        const father = ctx.state.actors.find(
          (candidate) =>
            candidate.id ===
            (actor.tier === 'protagonist'
              ? `${actor.id}:father`
              : actor.id.replace(/:mother$/, ':father')),
        );
        const sharesFamily =
          actor.tier === 'protagonist' ||
          (actor.id.endsWith(':mother') && ['ja', 'ru'].includes(region.names.scheme));
        const family = sharesFamily
          ? (father?.name.family ?? null)
          : region.names.select('family', request, ctx.random);
        const given = region.names.select('given', request, ctx.random);
        const paternalGiven =
          actor.tier === 'protagonist'
            ? (father?.name.given ?? null)
            : region.names.scheme === 'ru'
              ? region.names.select('given', { ...request, sex: 'male' }, ctx.random)
              : null;
        actor.name = {
          scheme: region.names.scheme,
          family,
          given,
          patronymic: region.names.patronymic(paternalGiven),
        };
      },
    },
  ];
}
