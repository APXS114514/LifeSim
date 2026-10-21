import { BIRTH_REGION_IDS, isSelectableBirthYear } from '@lifesim/content-schema';
import { loadRequiredPacks } from '@lifesim/country-packs';
import type { RealLifeRequest } from '@lifesim/real-world';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../components/LanguageSwitch.tsx';
import { SaveIssuePanel } from '../components/SaveIssuePanel.tsx';
import {
  clearGame,
  downloadSaveBackup,
  loadGameAsync,
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

const PENDING_START_KEY = 'lifesim.pending-start.v1';

function pendingStart(): RealLifeRequest | null {
  try {
    const raw = sessionStorage.getItem(PENDING_START_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as RealLifeRequest;
    return typeof value.seed === 'string' &&
      (value.region === 'random' || BIRTH_REGION_IDS.includes(value.region)) &&
      (value.year === 'random' || isSelectableBirthYear(value.year))
      ? value
      : null;
  } catch {
    return null;
  }
}
function clearPendingStart(): void {
  try {
    sessionStorage.removeItem(PENDING_START_KEY);
  } catch {
    /* Storage can be disabled. */
  }
}
async function prepareSession(
  request: RealLifeRequest,
  progress: (completed: number, total: number) => void,
): Promise<GameSession> {
  await loadRequiredPacks(request.region, progress);
  const created = GameSession.create(request);
  created.settleBirthDay();
  return created;
}

function createSessionSeed(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint32Array(4))]
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

export function App() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.resolvedLanguage === 'en' ? 'en' : 'zh-Hans';
  const [game, setGame] = useState<GameState | null>(null);
  const [issue, setIssue] = useState<SaveIssue | null>(null);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(true);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [packError, setPackError] = useState<{ detail: string; request?: RealLifeRequest } | null>(
    null,
  );

  const [error, setError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [prefs, setPrefs] = useState(() => loadPreferences());

  useEffect(() => {
    let cancelled = false;
    const pending = pendingStart();
    const onProgress = (completed: number, total: number) => {
      if (!cancelled) setProgress({ completed, total });
    };
    const ready: Promise<SaveLoadResult> = pending
      ? prepareSession(pending, onProgress).then((session) => ({ kind: 'loaded', session }))
      : loadGameAsync(undefined, onProgress);
    void ready
      .then((result) => {
        if (cancelled) return;
        if (result.kind === 'loaded') {
          setGame({ session: result.session, revision: 0 });
          setRestored(pending === null);
          if (pending) {
            setSaveFailed(!saveGame(result.session));
            clearPendingStart();
          }
        } else if (result.kind === 'failed') setIssue(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled)
          setPackError({ detail: String(caught), ...(pending ? { request: pending } : {}) });
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const persist = useCallback((): void => {
    if (!session) return;
    setSaveFailed(!saveGame(session));
    setGame((current) =>
      current ? { session: current.session, revision: current.revision + 1 } : current,
    );
  }, [session]);

  function changePreferences(next: Preferences): void {
    savePreferences(next);
    setPrefs(next);
  }

  function start(choice: { region: BirthRegionId | 'random'; year: number | 'random' }): void {
    if (issue || busy || packError) return;
    const seed = createSessionSeed();
    void startRequest({ seed, ...choice });
  }

  async function startRequest(request: RealLifeRequest): Promise<void> {
    setBusy(true);
    setPackError(null);
    try {
      const created = await prepareSession(request, (completed, total) => {
        setProgress({ completed, total });
      });
      setSaveFailed(!saveGame(created));
      setGame({ session: created, revision: 0 });
      setRestored(false);
      setError(null);
    } catch (caught) {
      setPackError({ detail: String(caught), request });
    } finally {
      setBusy(false);
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
    if (busy) return;
    setBusy(true);
    setPackError(null);
    void loadGameAsync(undefined, (completed, total) => {
      setProgress({ completed, total });
    })
      .then((result) => {
        setIssue(result.kind === 'failed' ? result : null);
        setGame(result.kind === 'loaded' ? { session: result.session, revision: 0 } : null);
        setRestored(result.kind === 'loaded');
        setError(null);
        setSaveFailed(false);
      })
      .catch((caught: unknown) => {
        setPackError({ detail: String(caught) });
      })
      .finally(() => {
        setBusy(false);
      });
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

      {busy && <p role="status">{t('packs.loading', progress)}</p>}
      {packError && (
        <section className="error-panel" role="alert">
          <p>{t('packs.failed')}</p>
          <button
            type="button"
            onClick={() => {
              // Browsers retain failed ESM imports until navigation; preserve this request first.
              if (packError.request) {
                try {
                  sessionStorage.setItem(PENDING_START_KEY, JSON.stringify(packError.request));
                } catch {
                  /* A refresh still allows choosing again when storage is disabled. */
                }
              }
              window.location.reload();
            }}
          >
            {t('packs.retry')}
          </button>
        </section>
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
            onPersist={persist}
            control={control}
            onNewLife={newLife}
          />
        ) : (
          <CharacterCreationPage onStart={start} busy={busy || packError !== null} />
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
