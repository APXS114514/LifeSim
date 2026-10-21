import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { pwaSnapshot, subscribePwa } from '../pwa/register.ts';

export function PwaStatus({ onUpdate }: { onUpdate: () => void }) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(subscribePwa, pwaSnapshot);
  if (!state.offline && !state.unavailable && !state.updateAvailable) return null;
  return (
    <aside className="pwa-status" role="status">
      {state.offline && <p>{t('offline.current')}</p>}
      {state.unavailable && <p>{t('offline.unavailable')}</p>}
      {state.updateAvailable && (
        <p>
          {t('offline.updateAvailable')}{' '}
          <button type="button" onClick={onUpdate}>
            {t('offline.applyUpdate')}
          </button>
        </p>
      )}
    </aside>
  );
}
