import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../components/LanguageSwitch.tsx';
import { CharacterCreationPage } from '../pages/CharacterCreationPage.tsx';

export function App() {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = t('app.title');
  }, [t]);

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

      <main>
        <CharacterCreationPage />
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
