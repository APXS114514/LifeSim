import { useEffect, useState } from 'react';
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

  useEffect(() => {
    document.title = t('app.title');
  }, [t]);

  function run(action: (session: GameSession) => void): void {
    if (!game) return;
    try {
      action(game.session);
      saveGame(game.session);
      setGame({ session: game.session, revision: game.revision + 1 });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function start(choice: { region: BirthRegionId | 'random'; year: number | 'random' }): void {
    if (issue) return;
    try {
      const seed =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : String(Math.random());
      const session = GameSession.create({
        seed,
        region: choice.region,
        year: choice.year,
      });
      session.advance();
      saveGame(session);
      setGame({ session, revision: 0 });
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
  }

  /** 重试读取：成功则进入游戏；仍然失败则更新提示；没有存档则回到出生设置。 */
  function retryLoad(): void {
    const result = loadGame();
    if (result.kind === 'loaded') {
      setGame({ session: result.session, revision: 0 });
      setIssue(null);
      setRestored(true);
      setError(null);
      return;
    }
    setIssue(result.kind === 'failed' ? result : null);
    setGame(null);
    setRestored(false);
  }

  /** 玩家明确确认清除后才删除存档（主键与保留副本）。 */
  function discardAndStartOver(): void {
    clearGame();
    setIssue(null);
    setGame(null);
    setRestored(false);
    setError(null);
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <h1>{t('app.title')}</h1>
          <p className="tagline">{t('app.tagline')}</p>
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

      <main>
        {issue ? null : game ? (
          <PlayPage
            session={game.session}
            locale={locale}
            restored={restored}
            onAdvance={() => {
              run((session) => session.advance());
            }}
            onChoose={(optionId) => {
              run((session) => session.choose(optionId));
            }}
            onFinish={() => {
              run((session) => session.finish());
            }}
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
        </ul>
      </footer>
    </div>
  );
}
