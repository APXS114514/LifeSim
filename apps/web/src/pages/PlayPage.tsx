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
    <div className={'game pack-' + session.birth.packId}>
      {restored && (
        <p className="restored-notice" role="status">
          {t('play.restored')}
        </p>
      )}

      <div className="game-grid">
        <aside className="game-side">
          <section className="character-card" aria-labelledby="character-heading">
            <div className="character-head">
              <span className="region-mark" aria-hidden="true">
                {session.birth.packId}
              </span>
              <div>
                <p className="eyebrow">{t('play.character')}</p>
                <h2 id="character-heading">{packName}</h2>
              </div>
            </div>
            <p className="character-line">
              {session.birth.birthDate} · {place} · {settlement}
            </p>
            <p className="character-line">
              {polity} · {currency}
            </p>
            <p className="character-line seed-line">
              {t('play.seed')} {session.request.seed}
            </p>
            <div className="age-badge" aria-label={t('play.age')}>
              <span className="age-number">{age ?? '—'}</span>
              <span className="age-label">{session.isEnded ? t('play.died') : t('play.age')}</span>
            </div>
          </section>

          <div className="side-controls">
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
            <p className="hint">{t('play.autoSave')}</p>
            {!session.isEnded && (
              <button type="button" className="secondary" onClick={onNewLife}>
                {t('play.newLife')}
              </button>
            )}
          </div>
        </aside>

        <div className="game-main">
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
            <div className="toolbar action-bar">
              <button type="button" className="primary" onClick={onAdvance}>
                {t('play.continue')}
              </button>
              <button type="button" className="secondary" onClick={onFinish}>
                {t('play.finish')}
              </button>
            </div>
          )}

          <Timeline session={session} locale={locale} showFinance={showFinance} />
        </div>
      </div>
    </div>
  );
}
