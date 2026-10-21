import type { Locale } from '@lifesim/content-schema';
import { describeCharacterLocations, formatRealMoney } from '@lifesim/real-world';
import { useTranslation } from 'react-i18next';
import { PlacePolityLabel } from './PlacePolityLabel.tsx';
import type { GameSession } from '../game/session.ts';

export function SummaryCard({ session, locale }: { session: GameSession; locale: Locale }) {
  const { t } = useTranslation();
  const summary = session.summary;
  const currency = session.currencyName(summary.currency, locale);
  const balance = formatRealMoney(summary.finalBalanceMinor, summary.currency, locale);
  const age = summary.ageAtDeath === null ? t('summary.alive') : String(summary.ageAtDeath);
  const cause = summary.causeOfDeath
    ? session.label('cause', summary.causeOfDeath, locale)
    : t('summary.unknownCause');
  const snapshot = session.simulation.snapshot();
  const actor = snapshot.actors.find((candidate) => candidate.id === snapshot.activeCharacterId);
  const locations = actor
    ? describeCharacterLocations(session.pack, actor, session.currentDate, locale)
    : null;

  return (
    <section className="summary-card" aria-labelledby="summary-heading" aria-live="polite">
      <p className="eyebrow">{t('summary.eyebrow')}</p>
      <h2 id="summary-heading">{t('summary.heading')}</h2>
      <dl className="summary-grid">
        <div>
          <dt>{t('summary.age')}</dt>
          <dd>{t('summary.ageValue', { age })}</dd>
        </div>
        <div>
          <dt>{t('summary.education')}</dt>
          <dd>{session.label('level', summary.education, locale)}</dd>
        </div>
        <div>
          <dt>{t('summary.work')}</dt>
          <dd>{t('summary.years', { years: summary.yearsEmployed })}</dd>
        </div>
        <div>
          <dt>{t('summary.balance')}</dt>
          <dd>
            {balance} <span className="hint">{currency}</span>
          </dd>
        </div>
        <div>
          <dt>{t('summary.cause')}</dt>
          <dd>{cause}</dd>
        </div>
        <div>
          <dt>{t('summary.facts')}</dt>
          <dd>{summary.factCount}</dd>
        </div>
        {locations && (
          <>
            <div>
              <dt>{t('summary.birthPlace')}</dt>
              <dd>
                <PlacePolityLabel place={locations.birth.place} polity={locations.birth.polity} />
              </dd>
            </div>
            <div>
              <dt>{t('summary.residence')}</dt>
              <dd>
                <PlacePolityLabel
                  place={locations.residence.place}
                  polity={locations.residence.polity}
                />
              </dd>
            </div>
          </>
        )}
      </dl>
      {summary.decisions.length > 0 && (
        <div className="summary-decisions">
          <h3>{t('summary.decisions')}</h3>
          <ul>
            {summary.decisions.map((decision, index) => (
              <li key={index}>
                {t('summary.decisionLine', {
                  decision: t('decision.types.' + decision.decision, {
                    defaultValue: decision.decision,
                  }),
                  option: t('decision.options.' + decision.option, {
                    defaultValue: decision.option,
                  }),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
