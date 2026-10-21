import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SaveIssueReason } from '../game/storage.ts';

/**
 * 恢复失败时的阻塞面板（M3-000）。
 *
 * 原始存档已经保留；这里只提供「下载备份」「两步确认清除」「重试读取」，
 * 不提供任何自动删除路径。
 */
export function SaveIssuePanel({
  reason,
  onDownload,
  onClear,
  onRetry,
}: {
  reason: SaveIssueReason;
  onDownload: () => void;
  onClear: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="save-issue" role="alert">
      <h2>{t('saveIssue.heading')}</h2>
      <p>{reason === 'incompatible' ? t('saveIssue.incompatible') : t('saveIssue.unreadable')}</p>
      <p>{t('saveIssue.kept')}</p>
      <div className="actions">
        <button type="button" onClick={onDownload}>
          {t('saveIssue.download')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (confirming) {
              onClear();
              return;
            }
            setConfirming(true);
          }}
        >
          {confirming ? t('saveIssue.confirmClear') : t('saveIssue.clear')}
        </button>
        <button type="button" className="secondary" onClick={onRetry}>
          {t('saveIssue.retry')}
        </button>
      </div>
    </section>
  );
}
