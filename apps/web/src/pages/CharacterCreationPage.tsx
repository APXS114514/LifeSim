import {
  BIRTH_REGION_IDS,
  BIRTH_YEAR_MAX,
  BIRTH_YEAR_MIN,
  isSelectableBirthYear,
  type BirthRegionId,
} from '@lifesim/content-schema';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
          fill={index === 2 ? 'var(--region-accent)' : 'none'}
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
}: {
  onStart: (choice: { region: RegionChoice; year: number | 'random' }) => void;
}) {
  const { t } = useTranslation();
  const ids = { regionHint: useId(), yearHint: useId(), yearError: useId(), start: useId() };

  const [region, setRegion] = useState<RegionChoice>('random');
  const [yearMode, setYearMode] = useState<YearMode>('random');
  const [yearText, setYearText] = useState('1978');

  const yearValid = /^\d{4}$/.test(yearText) && isSelectableBirthYear(Number(yearText));
  const showYearError = yearMode === 'specific' && !yearValid;

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
      <aside className="creation-intro" aria-hidden="true">
        <p className="intro-kicker">
          {BIRTH_YEAR_MIN} — {BIRTH_YEAR_MAX}
        </p>
        <EraRibbon />
        <ul className="intro-regions">
          {BIRTH_REGION_IDS.map((id) => (
            <li key={id}>
              <span className="intro-code">{id}</span>
              <span>{t(`creation.region.${id}`)}</span>
            </li>
          ))}
        </ul>
      </aside>

      <form
        className="creation"
        aria-labelledby="creation-heading"
        onSubmit={(event) => {
          event.preventDefault();
          if (yearMode === 'specific' && !yearValid) return;
          onStart({ region, year: yearMode === 'random' ? 'random' : Number(yearText) });
        }}
      >
        <h2 id="creation-heading">{t('creation.heading')}</h2>

        <fieldset>
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
                <span>{t(`creation.region.${id}`)}</span>
              </label>
            ))}
          </div>
          <p className="hint" id={ids.regionHint}>
            {t('creation.region.randomHint')}
          </p>
        </fieldset>

        <fieldset>
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
            disabled={yearMode === 'specific' && !yearValid}
            aria-describedby={ids.start}
          >
            {t('creation.start')}
          </button>
          <p className="hint" id={ids.start}>
            {t('creation.startHint')}
          </p>
        </div>
      </form>
    </div>
  );
}
