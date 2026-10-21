import type { ISODate } from '@lifesim/content-schema';
import { flagUrlFor } from '../game/flags.ts';

/**
 * 小尺寸旗帜；纯装饰（旁边始终有文字名称），未登记政体时显示中性占位。
 */
export function PolityFlag({ polityId, date }: { polityId: string; date: ISODate }) {
  const url = flagUrlFor(polityId, date);
  if (!url) return <span className="polity-flag polity-flag-empty" aria-hidden="true" />;
  return (
    <img
      className="polity-flag"
      src={url}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
    />
  );
}
