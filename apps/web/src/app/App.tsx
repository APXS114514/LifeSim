import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../components/LanguageSwitch.tsx';
import { SaveIssuePanel } from '../components/SaveIssuePanel.tsx';
import {
  clearGame,
  downloadSaveBackup,
  loadGame,
  saveGame,
  type SaveLoadResult,
} from '../game/storage.ts';
import { GameSession } from '../game/session.ts';
import { loadPreferences, savePreferences, type Preferences } from '../game/prefs.ts';
import { TimeControl, timerScheduler } from '../game/time-control.ts';
import { baseYearMsForLifeLength, yearDurationMs } from '../game/year-pacing.ts';
import { CharacterCreationPage } from '../pages/CharacterCreationPage.tsx';
import { PlayPage } from '../pages/PlayPage.tsx';
import type { BirthRegionId, Locale } from '@lifesim/content-schema';

type GameState = { session: GameSession; revision: number };
type SaveIssue = Extract<SaveLoadResult, { kind: 'failed' }>;

export function App() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.resolvedLanguage === 'en' ? 'en' : 'zh-Hans';
  const [boot] = useState<SaveLoadResult>(() => loadGame());
  const [game, setGame] = useState<GameState | null>(
    boot.kind === 'loaded' ? { session: boot.session, revision: 0 } : null,
  );
  const [issue, setIssue] = useState<SaveIssue | null>(boot.kind === 'failed' ? boot : null);
  const [restored, setRestored] = useState(boot.kind === 'loaded');
  const [error, setError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [prefs, setPrefs] = useState(() => loadPreferences());

  useEffect(() => {
    document.title = t('app.title');
  }, [t]);

  const session = game?.session ?? null;

  // 时间控制与当前会话一一对应：每次推进都自动存档并触发重绘。
  const control = useMemo(() => {
    if (!session) return null;
    return new TimeControl({
      session,
      scheduler: timerScheduler(),
      onChange: () => {
        setSaveFailed(!saveGame(session));
        setGame((current) =>
          current ? { session: current.session, revision: current.revision + 1 } : current,
        );
      },
      onError: (caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      },
    });
  }, [session]);

  useEffect(() => () => control?.dispose(), [control]);
  useEffect(() => {
    control?.setSpeed(yearDurationMs(prefs.pace, baseYearMsForLifeLength(prefs.lifeLengthMinutes)));
  }, [control, prefs]);

  function changePreferences(next: Preferences): void {
    savePreferences(next);
    setPrefs(next);
  }

  function start(choice: { region: BirthRegionId | 'random'; year: number | 'random' }): void {
    if (issue) return;
    try {
      const seed =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : String(Math.random());
      const created = GameSession.create({
        seed,
        region: choice.region,
        year: choice.year,
      });
      // 只结算出生当天，然后停在出生日等玩家自己开始推进（M3-034）。
      created.settleBirthDay();
      setSaveFailed(!saveGame(created));
      setGame({ session: created, revision: 0 });
      setRestored(false);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function newLife(): void {
    clearGame();
    setGame(null);
    setRestored(false);
    setError(null);
    setSaveFailed(false);
  }

  /** 重试读取：成功则进入游戏；仍然失败则更新提示；没有存档则回到出生设置。 */
  function retryLoad(): void {
    const result = loadGame();
    if (result.kind === 'loaded') {
      setGame({ session: result.session, revision: 0 });
      setIssue(null);
      setRestored(true);
      setError(null);
      setSaveFailed(false);
      return;
    }
    setIssue(result.kind === 'failed' ? result : null);
    setGame(null);
    setRestored(false);
    setSaveFailed(false);
  }

  /** 玩家明确确认清除后才删除存档（主键与保留副本）。 */
  function discardAndStartOver(): void {
    clearGame();
    setIssue(null);
    setGame(null);
    setRestored(false);
    setError(null);
    setSaveFailed(false);
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          {/* 与 public/favicon.svg 同一图形；改这里时同步更新图标资源。 */}
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="40" height="40" fill="none" focusable="false">
              <circle cx="20" cy="20" r="18.5" stroke="currentColor" strokeOpacity="0.35" />
              <path
                d="M9 27c4.5 0 5.5-12 11-12s6 9 11 9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="9" cy="27" r="2.1" fill="currentColor" />
              <circle cx="20" cy="15" r="2.1" fill="currentColor" />
              <circle cx="31" cy="24" r="2.1" fill="currentColor" />
            </svg>
          </span>
          <div>
            <h1>{t('app.title')}</h1>
            <p className="tagline">{t('app.tagline')}</p>
          </div>
        </div>
        <LanguageSwitch />
      </header>

      <p className="stage-notice" role="note">
        {t('app.stageNotice')}
      </p>

      {issue && (
        <SaveIssuePanel
          reason={issue.reason}
          onDownload={() => {
            downloadSaveBackup(issue.raw);
          }}
          onClear={discardAndStartOver}
          onRetry={retryLoad}
        />
      )}

      {error && (
        <div className="error-panel" role="alert">
          <p>{t('play.error')}</p>
          <pre>{error}</pre>
          <button type="button" className="secondary" onClick={newLife}>
            {t('play.newLife')}
          </button>
        </div>
      )}

      {saveFailed && session && (
        <section className="save-issue" role="alert">
          <h2>{t('saveWriteIssue.heading')}</h2>
          <p>{t('saveWriteIssue.detail')}</p>
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                setSaveFailed(!saveGame(session));
              }}
            >
              {t('saveWriteIssue.retry')}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                downloadSaveBackup(JSON.stringify(session.serialize()));
              }}
            >
              {t('saveWriteIssue.download')}
            </button>
          </div>
        </section>
      )}

      <main>
        {issue ? null : game && control ? (
          <PlayPage
            session={game.session}
            locale={locale}
            restored={restored}
            saveFailed={saveFailed}
            prefs={prefs}
            onPrefsChange={changePreferences}
            control={control}
            onNewLife={newLife}
          />
        ) : (
          <CharacterCreationPage onStart={start} />
        )}
      </main>

      <footer className="about">
        <h2>{t('about.heading')}</h2>
        <ul>
          <li>{t('about.notPrediction')}</li>
          <li>{t('about.historyFixed')}</li>
          <li>{t('about.notGlobal')}</li>
          <li>{t('about.offline')}</li>
          <li>
            <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}>{t('about.licenses')}</a>
          </li>
        </ul>
      </footer>
    </div>
  );
}
