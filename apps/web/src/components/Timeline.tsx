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
  visibleCount,
}: {
  session: GameSession;
  locale: Locale;
  showFinance: boolean;
  visibleCount: number;
}) {
  const { t } = useTranslation();
  const revealed = session.facts.slice(0, visibleCount);
  const facts: SimEventFact[] = showFinance
    ? revealed
    : revealed.filter((fact) => fact.type !== 'finance.settlement');
  const groups = groupByYear(facts);

  return (
    <section className="panel timeline" aria-labelledby="timeline-heading">
      <div className="panel-head">
        <h2 id="timeline-heading">{t('play.timeline')}</h2>
        <span className="panel-aside">{t('play.timelineCount', { count: facts.length })}</span>
      </div>
      <div className="panel-body">
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
                      <li className={'fact fact-' + category} key={fact.id} data-fact-id={fact.id}>
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
      </div>
    </section>
  );
}
