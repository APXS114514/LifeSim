import type { Locale } from '@lifesim/content-schema';
import { ageOn } from '@lifesim/simulation-core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DecisionCard } from '../components/DecisionCard.tsx';
import { SummaryCard } from '../components/SummaryCard.tsx';
import { Timeline } from '../components/Timeline.tsx';
import type { GameSession } from '../game/session.ts';

export function PlayPage({
  session,
  locale,
  restored,
  onAdvance,
  onChoose,
  onFinish,
  onNewLife,
}: {
  session: GameSession;
  locale: Locale;
  restored: boolean;
  onAdvance: () => void;
  onChoose: (optionId: string) => void;
  onFinish: () => void;
  onNewLife: () => void;
}) {
  const { t } = useTranslation();
  const [showFinance, setShowFinance] = useState(false);
  const age = session.isEnded
    ? session.summary.ageAtDeath
    : Math.max(0, ageOn(session.birth.birthDate, session.currentDate));
  const packName = session.pack.names[locale];
  const place = session.label('place', session.birth.placeId, locale);
  const settlement = session.label('settlement', session.birth.settlement, locale);
  const polity = session.pack.politicalEntities.find(
    (entity) => entity.id === session.birth.politicalEntityId,
  )?.names[locale];
  const currency = session.currencyName(
    session.birth.currency.code + '-' + session.birth.currency.version,
    locale,
  );

  return (
    <div className="game">
      {restored && (
        <p className="restored-notice" role="status">
          {t('play.restored')}
        </p>
      )}

      <section className="character-card" aria-labelledby="character-heading">
        <div>
          <p className="eyebrow">{t('play.character')}</p>
          <h2 id="character-heading">{packName}</h2>
          <p className="character-line">
            {session.birth.birthDate} · {place} · {settlement}
          </p>
          <p className="character-line">
            {polity} · {currency}
          </p>
          <p className="character-line seed-line">
            {t('play.seed')} {session.request.seed}
          </p>
        </div>
        <div className="age-badge" aria-label={t('play.age')}>
          <span className="age-number">{age ?? '—'}</span>
          <span className="age-label">{session.isEnded ? t('play.died') : t('play.age')}</span>
        </div>
      </section>

      {session.isEnded ? (
        <>
          <SummaryCard session={session} locale={locale} />
          <div className="toolbar">
            <button type="button" className="primary" onClick={onNewLife}>
              {t('play.newLife')}
            </button>
          </div>
        </>
      ) : session.pending ? (
        <DecisionCard pending={session.pending} onChoose={onChoose} />
      ) : (
        <div className="toolbar">
          <button type="button" className="primary" onClick={onAdvance}>
            {t('play.continue')}
          </button>
          <button type="button" className="secondary" onClick={onFinish}>
            {t('play.finish')}
          </button>
        </div>
      )}

      <div className="timeline-controls">
        <label className="toggle">
          <input
            type="checkbox"
            checked={showFinance}
            onChange={(event) => {
              setShowFinance(event.target.checked);
            }}
          />
          <span>{showFinance ? t('play.hideFinance') : t('play.showFinance')}</span>
        </label>
        <div className="timeline-actions">
          {!session.isEnded && (
            <button type="button" className="secondary" onClick={onNewLife}>
              {t('play.newLife')}
            </button>
          )}
          <p className="hint">{t('play.autoSave')}</p>
        </div>
      </div>

      <Timeline session={session} locale={locale} showFinance={showFinance} />
    </div>
  );
}
