import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../components/LanguageSwitch.tsx';
import { clearGame, loadGame, saveGame } from '../game/storage.ts';
import { GameSession } from '../game/session.ts';
import { CharacterCreationPage } from '../pages/CharacterCreationPage.tsx';
import { PlayPage } from '../pages/PlayPage.tsx';
import type { BirthRegionId, Locale } from '@lifesim/content-schema';

type GameState = { session: GameSession; revision: number };

export function App() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.resolvedLanguage === 'en' ? 'en' : 'zh-Hans';
  const [boot] = useState(() => {
    const saved = loadGame();
    return { saved, restored: saved !== null };
  });
  const [game, setGame] = useState<GameState | null>(
    boot.saved ? { session: boot.saved, revision: 0 } : null,
  );
  const [restored, setRestored] = useState(boot.restored);
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
        {game ? (
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
