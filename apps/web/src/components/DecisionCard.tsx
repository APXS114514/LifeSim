import { useTranslation } from 'react-i18next';
import type { PendingDecision } from '@lifesim/simulation-core';

const optionKeys = ['A', 'B', 'C', 'D', 'E'];

export function DecisionCard({
  pending,
  onChoose,
}: {
  pending: PendingDecision;
  onChoose: (optionId: string) => void;
}) {
  const { t } = useTranslation();
  const typeLabel = t('decision.types.' + pending.type, { defaultValue: pending.type });
  const recommended = t('decision.options.' + pending.recommended.optionId, {
    defaultValue: pending.recommended.optionId,
  });

  return (
    <section className="decision-card" aria-labelledby="decision-heading" aria-live="polite">
      <div className="decision-top">
        <p className="eyebrow">{t('decision.eyebrow')}</p>
        <span className="decision-rule" aria-hidden="true" />
      </div>
      <h2 id="decision-heading">{t('decision.heading')}</h2>
      <p className="decision-context">
        {pending.at} · {typeLabel}
      </p>
      <p className="hint decision-recommend">
        {t('decision.recommended', { option: recommended })}
      </p>
      <div className="decision-options">
        {pending.options.map((option, index) => {
          const label = t('decision.options.' + option.id, { defaultValue: option.id });
          const reason = option.ineligibleReason
            ? t('decision.ineligible.' + option.ineligibleReason, {
                defaultValue: option.ineligibleReason,
              })
            : null;
          return (
            <button
              key={option.id}
              type="button"
              className="decision-option"
              disabled={!option.eligible}
              aria-describedby={reason ? 'decision-' + option.id + '-reason' : undefined}
              onClick={() => {
                onChoose(option.id);
              }}
            >
              <span className="option-key" aria-hidden="true">
                {optionKeys[index] ?? index + 1}
              </span>
              <span className="option-body">
                <span className="option-label">{label}</span>
                {reason && (
                  <span className="option-reason" id={'decision-' + option.id + '-reason'}>
                    {reason}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
