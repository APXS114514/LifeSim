import type { Locale } from '@lifesim/content-schema';
import { formatRealMoney } from '@lifesim/real-world';
import {
  deriveIncome,
  deriveIndicators,
  indicatorPercent,
  INDICATOR_KEYS,
  MacroStateSchema,
} from '@lifesim/systems';
import { useTranslation } from 'react-i18next';
import type { GameSession } from '../game/session.ts';

/** 当前底层状态的只读视图；派生值不写进存档，也不触发模拟推进。 */
export function Indicators({ session, locale }: { session: GameSession; locale: Locale }) {
  const { t } = useTranslation();
  const snapshot = session.simulation.snapshot();
  const actor = snapshot.actors.find((candidate) => candidate.id === snapshot.activeCharacterId);
  if (!actor) throw new Error('Snapshot has no active character');
  const values = deriveIndicators(snapshot, session.facts, session.region.queries.education);
  const income = deriveIncome(snapshot, session.facts);
  const macro = MacroStateSchema.parse(snapshot.world);
  const currency = `${macro.currency.code}-${macro.currency.version}`;
  const account = snapshot.householdAccounts.find(
    (candidate) => candidate.id === actor.finance.accountId,
  );
  const balance = account?.balanceMinor ?? 0;
  // 收入是过去一次结算的金额：跨币制变更时保留事实自己的币制，不能贴上新币标签。
  let latestSettlementSequence = -1;
  let incomeCurrency = currency;
  for (const fact of session.facts) {
    if (
      fact.type !== 'finance.settlement' ||
      !fact.actorIds.includes(actor.id) ||
      fact.sequence <= latestSettlementSequence
    )
      continue;
    latestSettlementSequence = fact.sequence;
    const label = fact.details?.['currency'];
    incomeCurrency =
      typeof label === 'string' && /^[A-Z]{3}-[1-9]\d*$/.test(label) ? label : currency;
  }
  const money = (minor: number, label: string) =>
    `${formatRealMoney(minor, label, locale)} ${session.currencyName(label, locale)}`;

  return (
    <section className="panel status-panel indicators" aria-labelledby="indicators-heading">
      <div className="panel-head">
        <h3 id="indicators-heading">{t('play.panel.heading')}</h3>
        <span className="panel-aside">0–100</span>
      </div>
      <div className="panel-body">
        <ul className="meter-list indicator-list">
          {INDICATOR_KEYS.map((key) => {
            const percent = indicatorPercent(values[key]);
            const label = t(`play.panel.indicators.${key}`);
            return (
              <li
                key={key}
                className="meter indicator"
                data-tone={key}
                data-indicator={key}
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <span className="meter-label indicator-label">{label}</span>
                <span className="meter-track indicator-bar" aria-hidden="true">
                  <span className="meter-fill indicator-fill" style={{ width: `${percent}%` }} />
                </span>
                <span className="meter-value indicator-value">{percent}</span>
              </li>
            );
          })}
        </ul>
        <dl className="field-grid is-compact indicator-facts">
          <div className="field" data-field="education">
            <dt>{t('play.panel.education')}</dt>
            <dd>
              {session.label('level', actor.education.completed, locale)}
              {actor.education.enrolledIn !== null && (
                <span className="indicator-enrolling">
                  {t('play.panel.enrolling', {
                    level: session.label('level', actor.education.enrolledIn, locale),
                  })}
                </span>
              )}
            </dd>
          </div>
          <div className="field" data-field="employment">
            <dt>{t('play.panel.employmentLabel')}</dt>
            <dd>{t(`play.panel.employment.${actor.employment.status}`)}</dd>
          </div>
          <div className="field" data-field="illness">
            <dt>{t('play.panel.illness')}</dt>
            <dd>
              {actor.health.conditions.length === 0
                ? t('play.panel.noIllness')
                : actor.health.conditions.map((condition) => (
                    <span className="indicator-condition" key={condition.factId}>
                      {t(`play.panel.condition.${condition.id}`, { defaultValue: condition.id })} ·{' '}
                      {t(condition.treated ? 'play.panel.treated' : 'play.panel.untreated')}
                    </span>
                  ))}
            </dd>
          </div>
          <div className="field" data-field="income">
            <dt>{t('play.panel.income')}</dt>
            <dd>
              {income === null ? (
                t('play.panel.noIncomeYet')
              ) : (
                <>
                  {money(income.incomeMinor, incomeCurrency)}
                  <span className="hint indicator-income-source">
                    {t(`play.panel.incomeSource.${income.incomeSource}`)} · {income.at}
                  </span>
                </>
              )}
            </dd>
          </div>
          <div className="field" data-field="balance">
            <dt>{t('play.panel.balance')}</dt>
            <dd>
              {money(balance, currency)}
              {balance < 0 && <span className="indicator-debt">{t('play.panel.debtBadge')}</span>}
            </dd>
          </div>
        </dl>
        <details className="indicator-about">
          <summary>{t('play.panel.about.heading')}</summary>
          <p>{t('play.panel.about.summary')}</p>
          <ul>
            {INDICATOR_KEYS.map((key) => (
              <li key={key} data-indicator-note={key}>
                {t(`play.panel.about.${key}`)}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
