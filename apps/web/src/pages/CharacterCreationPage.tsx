import {
  BIRTH_REGION_IDS,
  BIRTH_YEAR_MAX,
  BIRTH_YEAR_MIN,
  isSelectableBirthYear,
  type BirthRegionId,
} from '@lifesim/content-schema';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArchiveCard } from '../components/Archive.tsx';
import { PolityFlag } from '../components/PolityFlag.tsx';
import { polityForRegionAt } from '../game/flags.ts';

type RegionChoice = 'random' | BirthRegionId;
type YearMode = 'random' | 'specific';

const yearRange = { min: BIRTH_YEAR_MIN, max: BIRTH_YEAR_MAX };

/** 装饰性年代弧线；只用于视觉，不承载信息（真正的信息在右侧表单与说明里）。 */
function EraRibbon() {
  return (
    <svg
      className="era-ribbon"
      viewBox="0 0 260 124"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M14 92 C 66 92, 74 30, 130 30 S 194 92, 246 92"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {[
        [14, 92, 3.4],
        [72, 58, 2.4],
        [130, 30, 5],
        [188, 58, 2.4],
        [246, 92, 3.4],
      ].map(([cx, cy, r], index) => (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          r={r}
          className={index === 2 ? 'era-dot-active' : undefined}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      ))}
      <text x="6" y="114" fill="currentColor" fontSize="11" letterSpacing="1">
        {BIRTH_YEAR_MIN}
      </text>
      <text x="216" y="114" fill="currentColor" fontSize="11" letterSpacing="1">
        {BIRTH_YEAR_MAX}
      </text>
    </svg>
  );
}

/**
 * 出生设置：把选择交给真实的出生选择器（M2）；界面不重新实现抽样规则。
 */
export function CharacterCreationPage({
  onStart,
  busy = false,
}: {
  busy?: boolean;
  onStart: (choice: { region: RegionChoice; year: number | 'random' }) => void;
}) {
  const { t } = useTranslation();
  const ids = { regionHint: useId(), yearHint: useId(), yearError: useId(), start: useId() };

  const [region, setRegion] = useState<RegionChoice>('random');
  const [yearMode, setYearMode] = useState<YearMode>('random');
  const [yearText, setYearText] = useState('1978');

  const yearValid = /^\d{4}$/.test(yearText) && isSelectableBirthYear(Number(yearText));
  const showYearError = yearMode === 'specific' && !yearValid;
  // 旗帜跟随选择的年份：随机年份按现代显示；指定年份可看到苏联等历史旗帜。
  const flagYear = yearMode === 'specific' && yearValid ? Number(yearText) : BIRTH_YEAR_MAX;
  const flagDate = `${flagYear}-01-01`;

  const regionLabel =
    region === 'random' ? t('creation.summary.randomRegion') : t(`creation.region.${region}`);
  const yearLabel =
    yearMode === 'random'
      ? t('creation.summary.randomYear')
      : yearValid
        ? t('creation.summary.year', { year: yearText })
        : '—';

  return (
    <div className="creation-hero">
      <ArchiveCard
        as="aside"
        className="creation-intro"
        decorative
        title={t('creation.intro.title')}
        number={`${BIRTH_YEAR_MIN}—${BIRTH_YEAR_MAX}`}
        guilloche
      >
        <p className="intro-kicker">
          {BIRTH_YEAR_MIN} — {BIRTH_YEAR_MAX}
        </p>
        <p className="intro-lead">{t('creation.intro.lead')}</p>
        <EraRibbon />
        <ul className="intro-regions">
          {BIRTH_REGION_IDS.map((id) => (
            <li key={id}>
              <span className="intro-code">{id}</span>
              <PolityFlag polityId={polityForRegionAt(id, flagDate)} date={flagDate} />
              <span>{t(`creation.region.${id}`)}</span>
            </li>
          ))}
        </ul>
      </ArchiveCard>

      <form
        className="creation archive-card"
        aria-labelledby="creation-heading"
        onSubmit={(event) => {
          event.preventDefault();
          if (yearMode === 'specific' && !yearValid) return;
          onStart({ region, year: yearMode === 'random' ? 'random' : Number(yearText) });
        }}
      >
        <div className="archive-bar">
          <h2 id="creation-heading">{t('creation.heading')}</h2>
          <span className="archive-number">{t('creation.formNumber')}</span>
        </div>
        <div className="archive-body">
          <fieldset disabled={busy}>
            <legend>{t('creation.region.legend')}</legend>
            <div className="choices">
              <label className="choice choice-random">
                <input
                  type="radio"
                  name="region"
                  value="random"
                  checked={region === 'random'}
                  aria-describedby={ids.regionHint}
                  onChange={() => {
                    setRegion('random');
                  }}
                />
                <span>{t('creation.region.random')}</span>
              </label>
              {BIRTH_REGION_IDS.map((id) => (
                <label className="choice" key={id}>
                  <input
                    type="radio"
                    name="region"
                    value={id}
                    checked={region === id}
                    onChange={() => {
                      setRegion(id);
                    }}
                  />
                  <PolityFlag polityId={polityForRegionAt(id, flagDate)} date={flagDate} />
                  <span>{t(`creation.region.${id}`)}</span>
                </label>
              ))}
            </div>
            <p className="hint" id={ids.regionHint}>
              {t('creation.region.randomHint')}
            </p>
          </fieldset>

          <fieldset disabled={busy}>
            <legend>{t('creation.year.legend')}</legend>
            <div className="choices choices-year">
              <label className="choice">
                <input
                  type="radio"
                  name="year-mode"
                  value="random"
                  checked={yearMode === 'random'}
                  aria-describedby={ids.yearHint}
                  onChange={() => {
                    setYearMode('random');
                  }}
                />
                <span>{t('creation.year.random')}</span>
              </label>
              <label className="choice">
                <input
                  type="radio"
                  name="year-mode"
                  value="specific"
                  checked={yearMode === 'specific'}
                  onChange={() => {
                    setYearMode('specific');
                  }}
                />
                <span>{t('creation.year.specific')}</span>
              </label>
            </div>
            <label className="year-input">
              <span>{t('creation.year.inputLabel')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={BIRTH_YEAR_MIN}
                max={BIRTH_YEAR_MAX}
                step={1}
                value={yearText}
                disabled={yearMode !== 'specific'}
                aria-invalid={showYearError}
                aria-describedby={showYearError ? ids.yearError : undefined}
                onChange={(event) => {
                  setYearText(event.target.value);
                }}
              />
            </label>
            <p className="hint" id={ids.yearHint}>
              {t('creation.year.randomHint', yearRange)}
            </p>
            {showYearError && (
              <p className="error" id={ids.yearError} role="alert">
                {t('creation.year.rangeError', yearRange)}
              </p>
            )}
          </fieldset>

          <div className="summary" aria-live="polite">
            <span className="summary-label">{t('creation.summary.label')}</span>
            <span className="summary-value">
              {regionLabel} · {yearLabel}
            </span>
            <p className="hint">{t('creation.randomRule')}</p>
          </div>

          <div className="actions">
            <button
              type="submit"
              className="primary"
              disabled={busy || (yearMode === 'specific' && !yearValid)}
              aria-describedby={ids.start}
            >
              {t('creation.start')}
            </button>
            <p className="hint" id={ids.start}>
              {t('creation.startHint')}
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
