import { fingerprint } from '@lifesim/simulation-core';

/**
 * 档案编号与索引条（M4-022）：只用于显示，由种子与出生资料的散列确定，
 * 不消耗模拟的随机流，也不写进存档（每次都能从同样的输入重算出来）。
 */
export interface ArchiveSource {
  readonly seed: string;
  readonly packId: string;
  readonly birthDate: string;
}

/** 7 位大写十六进制的档案码。 */
export function archiveCode(source: ArchiveSource): string {
  return fingerprint(`${source.seed}|${source.packId}|${source.birthDate}`)
    .slice(0, 7)
    .toUpperCase();
}

/** 例如 `JP-1978-3F0A9C1`。 */
export function archiveNumber(source: ArchiveSource): string {
  return `${source.packId}-${source.birthDate.slice(0, 4)}-${archiveCode(source)}`;
}

/** 等宽索引条，例如 `LIFESIM · JP · 19780504 · 3F0A9C1`（原创格式，不是任何证件号码）。 */
export function archiveIndexLine(source: ArchiveSource): string {
  return ['LIFESIM', source.packId, source.birthDate.replaceAll('-', ''), archiveCode(source)].join(
    ' · ',
  );
}
