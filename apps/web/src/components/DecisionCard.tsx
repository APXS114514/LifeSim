import { useTranslation } from 'react-i18next';
import type { PendingDecision } from '@lifesim/simulation-core';

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
      <p className="eyebrow">{t('decision.eyebrow')}</p>
      <h2 id="decision-heading">{t('decision.heading')}</h2>
      <p className="decision-context">
        {pending.at} · {typeLabel}
      </p>
      <p className="hint">{t('decision.recommended', { option: recommended })}</p>
      <div className="decision-options">
        {pending.options.map((option) => {
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
              className="primary decision-option"
              disabled={!option.eligible}
              aria-describedby={reason ? 'decision-' + option.id + '-reason' : undefined}
              onClick={() => {
                onChoose(option.id);
              }}
            >
              <span>{label}</span>
              {reason && (
                <span className="hint" id={'decision-' + option.id + '-reason'}>
                  {reason}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
