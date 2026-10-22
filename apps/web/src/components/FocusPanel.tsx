import { FOCUS_EFFECTS, YEARLY_FOCUS_IDS, type YearlyFocus } from '@lifesim/systems';
import { useTranslation } from 'react-i18next';
import type { FocusPlan } from '../game/session.ts';
import { Panel } from './Archive.tsx';

const PROBABILITY_EFFECTS = ['education', 'hiring', 'jobLoss', 'onset'] as const;
const STATE_EFFECTS = ['stress', 'ties'] as const;

/** 乘数写成相对变化（1.15 → +15%），不变时返回 null。 */
function percentChange(multiplier: number): string | null {
  const percent = Math.round((multiplier - 1) * 100);
  if (percent === 0) return null;
  return (percent > 0 ? '+' : '−') + String(Math.abs(percent)) + '%';
}

/** 0—1 的年度增量按 0—100 显示（0.03 → +3），不变时返回 null。 */
function pointChange(delta: number): string | null {
  const points = Math.round(delta * 100);
  if (points === 0) return null;
  return (points > 0 ? '+' : '−') + String(Math.abs(points));
}

/**
 * 年度重点选择器（M3-037B）：显示今年的重点，并设定从下一个生日起持续生效的重点。
 * 选择写成未来年份的预设（ADR-0008），这里只负责展示与回调；效果表直接读规则的设计表。
 */
export function FocusPanel({
  plan,
  disabled,
  onChange,
}: {
  plan: FocusPlan;
  disabled: boolean;
  onChange: (focus: YearlyFocus | null) => void;
}) {
  const { t } = useTranslation();
  const focusLabel = (focus: YearlyFocus) => t(`focus.options.${focus}`);
  const choices: (YearlyFocus | null)[] = [null, ...YEARLY_FOCUS_IDS];

  return (
    <Panel
      className="focus-panel"
      headingId="focus-heading"
      title={t('focus.heading')}
      aside={t('focus.assumption')}
    >
      {plan.current && (
        <p className="focus-current">
          {t('focus.current', {
            age: plan.current.age,
            focus: focusLabel(plan.current.focus),
            decidedBy: t(`focus.decidedBy.${plan.current.decidedBy}`),
          })}
        </p>
      )}
      {plan.current?.presetIgnored && (
        <p className="hint">
          {t('focus.ignored', { focus: focusLabel(plan.current.presetIgnored) })}
        </p>
      )}
      <fieldset className="focus-fieldset" disabled={disabled} aria-describedby="focus-hint">
        <legend>{t('focus.from', { age: plan.fromAge })}</legend>
        <div className="choices focus-choices">
          {choices.map((focus) => {
            const value = focus ?? 'principles';
            const unavailable = focus !== null && !plan.eligibleNow[focus];
            return (
              <label className="choice" key={value}>
                <input
                  type="radio"
                  name="yearly-focus"
                  value={value}
                  checked={plan.selected === focus}
                  aria-describedby={unavailable ? `focus-${value}-note` : undefined}
                  onChange={() => {
                    onChange(focus);
                  }}
                />
                <span className="focus-choice-text">
                  <span>{focus === null ? t('focus.principles') : focusLabel(focus)}</span>
                  {unavailable && (
                    <span className="focus-choice-note" id={`focus-${value}-note`}>
                      {t('focus.notYet')}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="hint" id="focus-hint">
        {disabled && <p className="focus-paused">{t('focus.pauseToChange')}</p>}
        <p>{t('focus.hint')}</p>
      </div>
      <details className="focus-effects">
        <summary>{t('focus.effects.heading')}</summary>
        <div className="focus-effects-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('focus.effects.focus')}</th>
                {[...PROBABILITY_EFFECTS, ...STATE_EFFECTS].map((effect) => (
                  <th scope="col" key={effect}>
                    {t(`focus.effects.${effect}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {YEARLY_FOCUS_IDS.map((focus) => {
                const effects = FOCUS_EFFECTS[focus];
                return (
                  <tr key={focus}>
                    <th scope="row">{focusLabel(focus)}</th>
                    {PROBABILITY_EFFECTS.map((effect) => (
                      <td key={effect}>
                        {percentChange(effects[effect]) ?? t('focus.effects.none')}
                      </td>
                    ))}
                    {STATE_EFFECTS.map((effect) => (
                      <td key={effect}>
                        {pointChange(effects[effect]) ?? t('focus.effects.none')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">{t('focus.effects.note')}</p>
      </details>
    </Panel>
  );
}
