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

/**
 * M0 草图：只收集出生设置并展示约束说明，不做任何抽样或模拟。
 * 随机规则的实现属于 M2 的出生选择器（GDD §4.3），这里不写一套界面专用的假规则。
 */
export function CharacterCreationPage() {
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
    <form
      className="creation"
      aria-labelledby="creation-heading"
      onSubmit={(event) => {
        event.preventDefault();
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
        <div className="choices">
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
        <button type="submit" className="primary" disabled aria-describedby={ids.start}>
          {t('creation.start')}
        </button>
        <p className="hint" id={ids.start}>
          {t('creation.startUnavailable')}
        </p>
      </div>
    </form>
  );
}
