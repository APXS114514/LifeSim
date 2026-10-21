import type { Locale, SimEventFact } from '@lifesim/content-schema';
import { useTranslation } from 'react-i18next';
import type { GameSession } from '../game/session.ts';
import { FactIcon } from './FactIcon.tsx';
import { factCategory } from './fact-category.ts';

function groupByYear(facts: readonly SimEventFact[]): [string, SimEventFact[]][] {
  const groups = new Map<string, SimEventFact[]>();
  for (const fact of facts) {
    const year = fact.at.slice(0, 4);
    const bucket = groups.get(year);
    if (bucket) bucket.push(fact);
    else groups.set(year, [fact]);
  }
  return [...groups.entries()];
}

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
  const groups = groupByYear(facts);

  return (
    <section className="timeline" aria-labelledby="timeline-heading">
      <div className="section-heading">
        <h2 id="timeline-heading">{t('play.timeline')}</h2>
        <span className="section-rule" aria-hidden="true" />
      </div>
      {facts.length === 0 ? (
        <p className="hint">{t('play.noFacts')}</p>
      ) : (
        <ol className="timeline-list" aria-live="polite">
          {groups.map(([year, items]) => (
            <li className="timeline-year-block" key={year}>
              <p className="timeline-year" aria-hidden="true">
                <span className="timeline-year-label">{year}</span>
                <span className="timeline-year-line" />
              </p>
              <ol className="timeline-year-facts">
                {items.map((fact) => {
                  const category = factCategory(fact);
                  return (
                    <li className={'fact fact-' + category} key={fact.id}>
                      <span className="fact-icon" aria-hidden="true">
                        <FactIcon category={category} />
                      </span>
                      <time className="fact-date" dateTime={fact.at}>
                        {fact.at.slice(5)}
                      </time>
                      <p className="fact-text">{session.render(fact, locale)}</p>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
