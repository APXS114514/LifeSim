import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MacroStateSchema } from '@lifesim/systems';
import { describe, expect, it, vi } from 'vitest';
import { GameSession } from '../game/session.ts';
import { Indicators } from './Indicators.tsx';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('indicator panel rendering', () => {
  it('keeps historic income in its settlement currency and debt in the current currency', () => {
    const session = GameSession.create({
      seed: 'fixture-indicator-panel',
      region: 'RU',
      year: 1978,
    });
    const snapshot = session.simulation.snapshot();
    // 虚构币制切换夹具：上一笔收入尚是 v1，当前余额已是 v2。
    snapshot.world = {
      ...MacroStateSchema.parse(snapshot.world),
      currency: { code: 'RUB', version: 2 },
    };
    snapshot.householdAccounts[0]!.balanceMinor = -12_300;
    snapshot.householdAccounts[0]!.currency = { code: 'RUB', version: 2 };
    const snapshotSpy = vi.spyOn(session.simulation, 'snapshot').mockReturnValue(snapshot);
    const currencySpy = vi.spyOn(session, 'currencyName').mockImplementation((label) => label);
    session.facts = [
      {
        id: 'fact:fixture-income',
        sequence: 1,
        type: 'finance.settlement',
        at: snapshot.at,
        actorIds: [snapshot.activeCharacterId],
        causeEventIds: [],
        outcomeCode: 'settled',
        templateId: 'fixture',
        evidenceIds: [],
        eventVersion: 1,
        details: { incomeMinor: 45_600, incomeSource: 'pension', currency: 'RUB-1' },
      },
    ];
    try {
      const html = renderToStaticMarkup(createElement(Indicators, { session, locale: 'en' }));
      expect(html).toContain('456.00 RUB-1');
      expect(html).toContain('-123.00 RUB-2');
      expect(html).toContain('play.panel.debtBadge');
      expect(html).toContain('play.panel.incomeSource.pension');
      expect(html).not.toContain('play.panel.noIncomeYet');
      expect(currencySpy).toHaveBeenCalledWith('RUB-1', 'en');
      expect(currencySpy).toHaveBeenCalledWith('RUB-2', 'en');
    } finally {
      snapshotSpy.mockRestore();
      currencySpy.mockRestore();
    }
  });
});
