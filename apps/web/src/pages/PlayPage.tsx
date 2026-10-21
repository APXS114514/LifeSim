import type { Locale } from '@lifesim/content-schema';
import { describeCharacterLocations, formatRealMoney, joinNames } from '@lifesim/real-world';
import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArchiveCard,
  Field,
  FieldGrid,
  Meter,
  Panel,
  type MeterTone,
} from '../components/Archive.tsx';
import { DecisionCard } from '../components/DecisionCard.tsx';
import { PixelAvatar } from '../components/PixelPortrait.tsx';
import { PlacePolityLabel } from '../components/PlacePolityLabel.tsx';
import { PolityFlag } from '../components/PolityFlag.tsx';
import { SummaryCard } from '../components/SummaryCard.tsx';
import { TimeControls } from '../components/TimeControls.tsx';
import { Timeline } from '../components/Timeline.tsx';
import { archiveIndexLine, archiveNumber } from '../game/archive.ts';
import type { GameSession } from '../game/session.ts';
import type { TimeControl } from '../game/time-control.ts';
import type { Preferences } from '../game/prefs.ts';
import { useYearReveal } from '../game/use-year-reveal.ts';
import { baseYearMsForLifeLength, yearDurationMs } from '../game/year-pacing.ts';

function subscribeMotionPreference(listener: () => void): () => void {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', listener);
  return () => {
    media.removeEventListener('change', listener);
  };
}

function allowsAnimation(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 五项派生指标的位置先排好；数值等 M4-016（在此之前一律显示「待接入」）。 */
const INDICATORS: readonly MeterTone[] = [
  'health',
  'happiness',
  'knowledge',
  'relationships',
  'economy',
];

const EMPLOYMENT_KEYS = {
  child: 'play.status.employment.child',
  student: 'play.status.employment.student',
  'not-in-labor-force': 'play.status.employment.not-in-labor-force',
  employed: 'play.status.employment.employed',
  unemployed: 'play.status.employment.unemployed',
  retired: 'play.status.employment.retired',
} as const;

export function PlayPage({
  session,
  locale,
  restored,
  saveFailed,
  prefs,
  onPrefsChange,
  control,
  onNewLife,
}: {
  session: GameSession;
  locale: Locale;
  restored: boolean;
  saveFailed: boolean;
  prefs: Preferences;
  onPrefsChange: (prefs: Preferences) => void;
  control: TimeControl;
  onNewLife: () => void;
}) {
  const { t } = useTranslation();
  const [showFinance, setShowFinance] = useState(false);
  // 时间控制推进的是内核里的同一份会话；订阅它的变化来重绘时间线与时钟。
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => control.subscribe(rerender), [control]);
  const allowAnimation = useSyncExternalStore(subscribeMotionPreference, allowsAnimation);
  const view = useYearReveal({
    control,
    session,
    yearMs: yearDurationMs(prefs.pace, baseYearMsForLifeLength(prefs.lifeLengthMinutes)),
    allowAnimation,
  });

  const summary = session.summary;
  const age = session.isEnded ? (summary.ageAtDeath ?? 0) : Math.max(0, session.age);
  const packName = session.pack.names[locale];
  const settlement = session.label('settlement', session.birth.settlement, locale);
  const currency = session.currencyName(summary.currency, locale);
  const snapshot = session.simulation.snapshot();
  const actor = snapshot.actors.find((candidate) => candidate.id === snapshot.activeCharacterId);
  if (!actor) throw new Error('Snapshot has no active character');
  const locations = describeCharacterLocations(session.pack, actor, session.clock, locale);
  const sameResidence =
    locations.birth.place === locations.residence.place &&
    locations.birth.polity === locations.residence.polity;
  const archive = {
    seed: session.request.seed,
    packId: session.birth.packId,
    birthDate: session.birth.birthDate,
  };

  const { education, employment, health } = actor;
  const educationText =
    education.enrolledIn !== null
      ? t('play.status.enrolled', { level: session.label('level', education.enrolledIn, locale) })
      : session.label('level', education.completed, locale);
  const condition = health.conditions[0];
  const healthText = condition
    ? condition.treated
      ? t('play.status.illTreated')
      : t('play.status.illUntreated')
    : t('play.status.healthy');
  const balanceText = `${formatRealMoney(summary.finalBalanceMinor, summary.currency, locale)} ${session.currencyName(summary.currency, locale)}`;

  return (
    <div className={'game pack-' + session.birth.packId}>
      {restored && (
        <p className="restored-notice" role="status">
          {t('play.restored')}
        </p>
      )}

      <div className="game-grid">
        <aside className="game-side">
          <ArchiveCard
            className="character-card"
            title={t('play.identity')}
            number={archiveNumber(archive)}
            labelledBy="character-heading"
            guilloche
          >
            <div className="character-head">
              <PixelAvatar
                age={age}
                year={Number(session.clock.slice(0, 4))}
                variantKey={`${session.request.seed}|${actor.id}`}
              />
              <div className="character-identity">
                <p className="character-name">{t('play.nameUnassigned')}</p>
                <p className="eyebrow">
                  {t('play.character')} · {packName}
                </p>
                <h2 id="character-heading">
                  <span className="region-flag" aria-hidden="true">
                    <PolityFlag polityId={actor.politicalEntityId} date={session.clock} />
                  </span>
                  {locations.politicalEntity}
                </h2>
              </div>
            </div>

            <FieldGrid compact>
              <Field label={t('play.born')}>
                {session.birth.birthDate} · {settlement}
              </Field>
              <Field label={t('play.birthPlace')}>
                <span className="meta-value with-flag">
                  <span className="birth-flag">
                    <PolityFlag
                      polityId={session.birth.politicalEntityId}
                      date={session.birth.birthDate}
                    />
                  </span>
                  <PlacePolityLabel place={locations.birth.place} polity={locations.birth.polity} />
                </span>
              </Field>
              <Field label={t('play.currentResidence')}>
                {sameResidence ? (
                  t('play.sameAsBirth')
                ) : (
                  <PlacePolityLabel
                    place={locations.residence.place}
                    polity={locations.residence.polity}
                  />
                )}
              </Field>
              <Field label={t('play.politicalEntity')}>{locations.politicalEntity}</Field>
              <Field label={t('play.citizenship')}>
                {joinNames(locations.citizenship, locale)}
              </Field>
              <Field label={t('play.currency')}>{currency}</Field>
              <Field label={t('play.seed')}>
                <span className="seed-line">{session.request.seed}</span>
              </Field>
            </FieldGrid>

            <p className="index-strip">{archiveIndexLine(archive)}</p>

            <div className="age-badge" aria-label={t('play.age')}>
              <span className="age-number">{age}</span>
              <span className="age-label">{session.isEnded ? t('play.died') : t('play.age')}</span>
            </div>
          </ArchiveCard>

          <Panel
            className="status-panel"
            headingId="status-heading"
            title={t('play.status.heading')}
            aside={t('play.status.aside')}
          >
            <ul className="meter-list">
              {INDICATORS.map((key) => (
                <Meter
                  key={key}
                  tone={key}
                  label={t(`play.status.indicators.${key}`)}
                  value={null}
                />
              ))}
            </ul>
            <p className="hint">{t('play.status.pendingNote')}</p>
            <FieldGrid compact>
              <Field label={t('play.status.education')}>{educationText}</Field>
              <Field label={t('play.status.employment.label')}>
                {t(EMPLOYMENT_KEYS[employment.status])}
              </Field>
              <Field label={t('play.status.health')}>{healthText}</Field>
              <Field label={t('play.status.balance')}>{balanceText}</Field>
            </FieldGrid>
          </Panel>

          <Panel className="side-controls" headingId="controls-heading" title={t('play.controls')}>
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
            {!saveFailed && <p className="hint">{t('play.autoSave')}</p>}
            {!session.isEnded && (
              <button type="button" className="secondary" onClick={onNewLife}>
                {t('play.newLife')}
              </button>
            )}
          </Panel>
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
          ) : (
            <>
              <TimeControls
                control={control}
                session={session}
                view={view}
                prefs={prefs}
                onPrefsChange={onPrefsChange}
              />
              {session.pending && (
                <DecisionCard
                  pending={session.pending}
                  onChoose={(optionId) => {
                    control.choose(optionId);
                  }}
                />
              )}
            </>
          )}

          <Timeline
            session={session}
            locale={locale}
            showFinance={showFinance}
            visibleCount={view.visibleCount}
          />
        </div>
      </div>
    </div>
  );
}
