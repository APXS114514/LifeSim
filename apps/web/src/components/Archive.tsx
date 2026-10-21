import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 档案设计系统的基础组件（M4-022）。外观在 styles/archive.css；这里只负责结构与可访问性。
 */

/** 档案卡：主色标题栏（标题 + 编号）与正文。标题可以是页面的主标题（传 headingId）。 */
export function ArchiveCard({
  title,
  number,
  headingId,
  guilloche = false,
  className,
  bodyClassName,
  children,
  as = 'section',
  labelledBy,
  decorative = false,
  live,
}: {
  title: ReactNode;
  number?: ReactNode;
  /** 给出时标题渲染为 h2（作为区块标题被读屏与测试找到）。 */
  headingId?: string;
  guilloche?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  as?: 'section' | 'aside' | 'div';
  labelledBy?: string;
  /** 纯装饰（内容在别处已有文字）时对读屏隐藏。 */
  decorative?: boolean;
  /** 内容会随推进出现或改变时（例如结局总结）向读屏播报。 */
  live?: 'polite';
}) {
  const Tag = as;
  return (
    <Tag
      className={'archive-card' + (className ? ' ' + className : '')}
      aria-labelledby={decorative ? undefined : (labelledBy ?? headingId)}
      aria-hidden={decorative ? true : undefined}
      aria-live={live}
    >
      <div className="archive-bar">
        {headingId ? (
          <h2 id={headingId}>{title}</h2>
        ) : (
          <span className="archive-title">{title}</span>
        )}
        {number ? <span className="archive-number">{number}</span> : null}
      </div>
      <div
        className={
          'archive-body' +
          (guilloche ? ' has-guilloche' : '') +
          (bodyClassName ? ' ' + bodyClassName : '')
        }
      >
        {children}
      </div>
    </Tag>
  );
}

/** 面板：标题 + 右侧注释 + 正文。 */
export function Panel({
  title,
  aside,
  headingId,
  className,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  headingId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={'panel' + (className ? ' ' + className : '')} aria-labelledby={headingId}>
      <div className="panel-head">
        <h2 id={headingId}>{title}</h2>
        {aside ? <span className="panel-aside">{aside}</span> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

/** 「待接入」：数据、模型或素材尚未提供时的诚实标记（不编造数值）。 */
export function PendingTag({ label }: { label?: string }) {
  const { t } = useTranslation();
  return <span className="pending-tag">{label ?? t('ui.pending')}</span>;
}

/** 字段：标签 + 值；`pending` 时显示「待接入」而不是空白或 0。 */
export function Field({
  label,
  children,
  pending = false,
}: {
  label: ReactNode;
  children?: ReactNode;
  pending?: boolean;
}) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd className={pending ? 'is-pending' : undefined}>{pending ? <PendingTag /> : children}</dd>
    </div>
  );
}

export function FieldGrid({
  compact = false,
  children,
}: {
  compact?: boolean;
  children: ReactNode;
}) {
  return <dl className={'field-grid' + (compact ? ' is-compact' : '')}>{children}</dl>;
}

export type MeterTone = 'health' | 'happiness' | 'knowledge' | 'relationships' | 'economy';

/**
 * 状态条：`value` 是 0—1 的比值（与 M4-016 的 `IndicatorValues` 同一口径），界面显示 0—100。
 * `value === null` 表示指标尚未接入：显示斜纹轨道与「—」，绝不显示伪造的数字。
 */
export function Meter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: MeterTone;
}) {
  const { t } = useTranslation();
  if (value === null) {
    return (
      <li className="meter is-pending" data-tone={tone}>
        <span className="meter-label">{label}</span>
        <span className="meter-track" aria-hidden="true" />
        <span className="meter-value" aria-label={t('ui.pending')}>
          —
        </span>
      </li>
    );
  }
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <li
      className="meter"
      data-tone={tone}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span className="meter-label">{label}</span>
      <span className="meter-track">
        <span className="meter-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="meter-value">{percent}</span>
    </li>
  );
}
