import { useTranslation } from 'react-i18next';
import type { YearRevealView } from '../game/year-reveal.ts';

export function YearProgress({ view, total }: { view: YearRevealView; total: number }) {
  const { t } = useTranslation();
  const percent = Math.round(view.progress * 100);
  return (
    <div
      className="year-progress"
      data-year-progress
      role="progressbar"
      aria-label={t('time.progress')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={view.date}
    >
      <span className="year-progress-date">{view.date}</span>
      <span className="year-progress-bar">
        <span className="year-progress-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="year-progress-count">
        {t('time.progressCount', { shown: view.visibleCount, total })}
      </span>
    </div>
  );
}
