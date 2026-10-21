import type { Locale } from '@lifesim/content-schema';
import { ageOn } from '@lifesim/simulation-core';
import { describeCharacterLocations, joinNames } from '@lifesim/real-world';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DecisionCard } from '../components/DecisionCard.tsx';
import { PlacePolityLabel } from '../components/PlacePolityLabel.tsx';
import { PolityFlag } from '../components/PolityFlag.tsx';
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
  const settlement = session.label('settlement', session.birth.settlement, locale);
  const currency = session.currencyName(
    session.birth.currency.code + '-' + session.birth.currency.version,
    locale,
  );
  const snapshot = session.simulation.snapshot();
  const actor = snapshot.actors.find((candidate) => candidate.id === snapshot.activeCharacterId);
  if (!actor) throw new Error('Snapshot has no active character');
  const locations = describeCharacterLocations(session.pack, actor, session.currentDate, locale);
  const sameResidence =
    locations.birth.place === locations.residence.place &&
    locations.birth.polity === locations.residence.polity;

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
              <span className="region-flag" aria-hidden="true">
                <PolityFlag polityId={actor.politicalEntityId} date={session.currentDate} />
              </span>
              <span className="region-mark" aria-hidden="true">
                {session.birth.packId}
              </span>
              <div>
                <p className="eyebrow">
                  {t('play.character')} · {packName}
                </p>
                <h2 id="character-heading">{locations.politicalEntity}</h2>
              </div>
            </div>
            <p className="character-line">
              {session.birth.birthDate} · {settlement}
            </p>
            <p className="character-line">{currency}</p>
            <p className="character-meta">
              <span className="meta-label">{t('play.birthPlace')}</span>
              <span className="meta-value with-flag">
                <span className="birth-flag">
                  <PolityFlag
                    polityId={session.birth.politicalEntityId}
                    date={session.birth.birthDate}
                  />
                </span>
                <PlacePolityLabel place={locations.birth.place} polity={locations.birth.polity} />
              </span>
            </p>
            <p className="character-meta">
              <span className="meta-label">{t('play.currentResidence')}</span>
              {sameResidence ? (
                <span className="meta-value">{t('play.sameAsBirth')}</span>
              ) : (
                <PlacePolityLabel
                  place={locations.residence.place}
                  polity={locations.residence.polity}
                />
              )}
            </p>
            <p className="character-meta">
              <span className="meta-label">{t('play.politicalEntity')}</span>
              <span className="meta-value">{locations.politicalEntity}</span>
            </p>
            <p className="character-meta">
              <span className="meta-label">{t('play.citizenship')}</span>
              <span className="meta-value">{joinNames(locations.citizenship, locale)}</span>
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
