import type { Locale } from '@lifesim/content-schema';
import { characterName, describeCharacterLocations, joinNames } from '@lifesim/real-world';
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ArchiveCard, Field, FieldGrid, Panel } from '../components/Archive.tsx';
import { ReflectionCard } from '../components/ReflectionCard.tsx';
import { planReflection } from '../game/reflections.ts';
import { DecisionCard } from '../components/DecisionCard.tsx';
import { Indicators } from '../components/Indicators.tsx';
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

export function PlayPage({
  session,
  locale,
  restored,
  saveFailed,
  prefs,
  onPrefsChange,
  onPersist,
  control,
  onNewLife,
}: {
  session: GameSession;
  locale: Locale;
  restored: boolean;
  saveFailed: boolean;
  prefs: Preferences;
  onPrefsChange: (prefs: Preferences) => void;
  onPersist: () => void;
  control: TimeControl;
  onNewLife: () => void;
}) {
  const { t } = useTranslation();
  const [showFinance, setShowFinance] = useState(false);
  // 时间控制推进的是内核里的同一份会话；订阅它的变化来重绘时间线与时钟。
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => control.subscribe(rerender), [control]);
  const timeArea = useRef<HTMLDivElement>(null);
  const reflection = planReflection({
    age: session.age,
    records: session.reflections,
    playback: control.state,
    prefs: prefs.reflections,
  });
  const reflectionNode = reflection.kind === 'none' ? null : reflection.node;
  // Resolve playback before the browser paints the question or another timer can advance.
  useLayoutEffect(() => {
    if (reflection.kind === 'show' && control.state === 'playing') control.pause();
    if (reflection.kind === 'record-skipped' && reflectionNode !== null) {
      if (
        session.recordReflection({
          node: reflectionNode,
          at: session.clock,
          option: null,
          note: null,
          status: 'skipped',
        })
      )
        onPersist();
    }
  }, [reflection.kind, reflectionNode, session, control, onPersist]);
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
                <p className="character-name">
                  {characterName(actor, locale) ?? t('play.nameUnassigned')}
                </p>
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
              <Field label={t('play.sex')}>{t(`creation.sex.${actor.sex}`)}</Field>
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

          <Indicators session={session} locale={locale} />

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
            <label className="toggle">
              <input
                type="checkbox"
                checked={prefs.reflections.enabled}
                onChange={(event) =>
                  onPrefsChange({
                    ...prefs,
                    reflections: { ...prefs.reflections, enabled: event.target.checked },
                  })
                }
              />
              <span>{t('reflection.enabled')}</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={prefs.reflections.skipDuringAutoPlay}
                disabled={!prefs.reflections.enabled}
                onChange={(event) =>
                  onPrefsChange({
                    ...prefs,
                    reflections: { ...prefs.reflections, skipDuringAutoPlay: event.target.checked },
                  })
                }
              />
              <span>{t('reflection.skipDuringAutoPlay')}</span>
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
              <div ref={timeArea} tabIndex={-1}>
                <TimeControls
                  blocked={reflection.kind === 'show'}
                  control={control}
                  session={session}
                  view={view}
                  prefs={prefs}
                  onPrefsChange={onPrefsChange}
                />
              </div>
              {reflection.kind === 'show' && (
                <ReflectionCard
                  key={reflection.node}
                  node={reflection.node}
                  locale={locale}
                  onSubmit={(option, note) => {
                    if (
                      session.recordReflection({
                        node: reflection.node,
                        at: session.clock,
                        option,
                        note,
                        status: option || note?.trim() ? 'answered' : 'skipped',
                      })
                    )
                      onPersist();
                    timeArea.current?.focus();
                  }}
                />
              )}
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
