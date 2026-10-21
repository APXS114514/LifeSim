import type { Locale, SimEventFact } from '@lifesim/content-schema';
import { useTranslation } from 'react-i18next';
import type { GameSession } from '../game/session.ts';

export function Timeline({
  session,
  locale,
  showFinance,
}: {
  session: GameSession;
  locale: Locale;
  showFinance: boolean;
}) {
  const { t } = useTranslation();
  const facts: SimEventFact[] = showFinance
    ? session.facts
    : session.facts.filter((fact) => fact.type !== 'finance.settlement');

  return (
    <section className="timeline" aria-labelledby="timeline-heading">
      <h2 id="timeline-heading">{t('play.timeline')}</h2>
      {facts.length === 0 ? (
        <p className="hint">{t('play.noFacts')}</p>
      ) : (
        <ol className="timeline-list" aria-live="polite">
          {facts.map((fact) => (
            <li className="fact" key={fact.id}>
              <time className="fact-date" dateTime={fact.at}>
                {fact.at}
              </time>
              <p className="fact-text">{session.render(fact, locale)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
