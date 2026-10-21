import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameSession } from '../game/session.ts';
import type { TimeControl } from '../game/time-control.ts';
import { LIFE_LENGTH_MINUTES, type LifeLengthMinutes, type Preferences } from '../game/prefs.ts';
import { PACE_MULTIPLIERS, type PaceMultiplier } from '../game/year-pacing.ts';
import type { YearRevealView } from '../game/year-reveal.ts';
import { YearProgress } from './YearProgress.tsx';

/**
 * 时间控制条（M3-034）：下一年、播放/暂停、速度、快进到下一个决定，
 * 以及与它们分开、样式更弱的「直接模拟至结局」（二次确认）。
 */
export function TimeControls({
  control,
  session,
  view,
  prefs,
  onPrefsChange,
}: {
  control: TimeControl;
  session: GameSession;
  view: YearRevealView;
  prefs: Preferences;
  onPrefsChange: (prefs: Preferences) => void;
}) {
  const { t } = useTranslation();
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const state = control.state;
  const playing = state === 'playing';
  const canStep = state === 'paused';
  const canFastForward = state === 'paused';
  const canPlay = state === 'paused' || state === 'playing';

  // 页面不可见时自动暂停；回来后保持暂停，等玩家自己继续。
  useEffect(() => {
    const onVisibility = () => {
      control.onVisibilityChange(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [control]);

  // 空格切换播放/暂停；焦点在输入控件或按钮上时不拦截。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (control.state === 'playing') control.pause();
      else if (control.state === 'paused') control.play();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [control]);

  const status =
    state === 'ended'
      ? t('time.ended')
      : state === 'awaiting-decision'
        ? t('time.awaiting')
        : playing
          ? t('time.playing')
          : t('time.paused');

  return (
    <section className="time-controls" aria-label={t('time.heading')}>
      <div className="time-head">
        <div className="time-clock">
          <p className="time-date">{view.date}</p>
          <p className="time-age">
            {t('time.ageValue', {
              age: session.isEnded ? (session.summary.ageAtDeath ?? session.age) : session.age,
            })}
          </p>
        </div>
        <p className="time-status" aria-live="polite">
          {status}
        </p>
      </div>

      <div className="time-buttons">
        <button
          type="button"
          className="primary"
          onClick={() => {
            control.stepOnce();
          }}
          disabled={!canStep}
        >
          {t('time.nextYear')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (playing) control.pause();
            else control.play();
          }}
          disabled={!canPlay}
        >
          {playing ? t('time.pause') : t('time.play')}
        </button>
        <label className="time-speed">
          <span>{t('time.lifeLength')}</span>
          <select
            aria-label={t('time.lifeLength')}
            value={prefs.lifeLengthMinutes}
            onChange={(event) => {
              onPrefsChange({
                ...prefs,
                lifeLengthMinutes: Number(event.target.value) as LifeLengthMinutes,
              });
            }}
          >
            {LIFE_LENGTH_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {t('time.lifeLengthOption', { minutes })}
              </option>
            ))}
          </select>
        </label>
        <label className="time-speed">
          <span>{t('time.speed')}</span>
          <select
            aria-label={t('time.speed')}
            value={prefs.pace}
            onChange={(event) => {
              onPrefsChange({ ...prefs, pace: Number(event.target.value) as PaceMultiplier });
            }}
            disabled={state === 'ended'}
          >
            {PACE_MULTIPLIERS.map((level) => (
              <option key={level} value={level}>
                {t(`time.pace.${level}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            control.fastForward();
          }}
          disabled={!canFastForward}
        >
          {t('time.fastForward')}
        </button>
      </div>

      {!session.isEnded && <YearProgress view={view} total={session.facts.length} />}

      {state !== 'ended' && (
        <div className="time-finish">
          {confirmingFinish ? (
            <>
              <p className="hint">{t('time.finishHint')}</p>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setConfirmingFinish(false);
                  control.finishLife();
                }}
              >
                {t('time.finishConfirm')}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setConfirmingFinish(false);
                }}
              >
                {t('time.cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setConfirmingFinish(true);
              }}
            >
              {t('time.finish')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
