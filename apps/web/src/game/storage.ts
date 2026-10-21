import { loadRequiredPacks, type PackProgress } from '@lifesim/country-packs';
import { SimulationError } from '@lifesim/simulation-core';
import { GameSession, parseGameSave } from './session.ts';

/** 正式自动存档键；M4 迁移到 IndexedDB 之前保持不变。 */
export const SAVE_KEY = 'lifesim.save.v1';
/** 恢复失败时保留的原始存档副本；只有玩家明确清除时才删除。 */
export const PRESERVED_KEY = 'lifesim.save.v1.preserved';

export type SaveIssueReason = 'incompatible' | 'unreadable';

export type SaveLoadResult =
  | { kind: 'none' }
  | { kind: 'loaded'; session: GameSession }
  | { kind: 'failed'; reason: SaveIssueReason; raw: string; detail: string };

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function write(store: Storage, key: string, value: string): boolean {
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // 存储被禁用或配额错误：没有可删除的内容。
  }
}

/** 版本不匹配与内容损坏要分开提示；两者都只影响提示，不影响保留策略。 */
function classify(error: unknown): SaveIssueReason {
  if (error instanceof SimulationError && error.code === 'incompatible-snapshot') {
    return 'incompatible';
  }
  if (error instanceof Error && error.message.includes('Unsupported save version')) {
    return 'incompatible';
  }
  return 'unreadable';
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 读取自动存档。
 *
 * 恢复失败时**不删除**任何数据：把原始字符串另存到 {@link PRESERVED_KEY}，主键保持原样，
 * 由界面提示玩家下载备份或手动清除（M3-000；Q9 的非破坏性兼容策略）。
 */
export function loadGame(): SaveLoadResult {
  const store = storage();
  if (!store) return { kind: 'none' };

  const raw = read(store, SAVE_KEY);
  if (raw === null) {
    // 主键被外部清掉但保留副本还在：让玩家仍能下载或清除，避免留下无法处理的数据。
    const preserved = read(store, PRESERVED_KEY);
    if (preserved !== null) {
      return {
        kind: 'failed',
        reason: 'unreadable',
        raw: preserved,
        detail: 'preserved-only',
      };
    }
    return { kind: 'none' };
  }

  try {
    const session = GameSession.restore(parseGameSave(JSON.parse(raw)));
    return { kind: 'loaded', session };
  } catch (error) {
    write(store, PRESERVED_KEY, raw);
    return { kind: 'failed', reason: classify(error), raw, detail: describe(error) };
  }
}

/**
 * 保存当前会话。存在待处理的旧存档副本时拒绝写入，避免覆盖玩家尚未处理的数据。
 * 返回是否真的写入。
 */
export function saveGame(session: GameSession): boolean {
  const store = storage();
  if (!store) return false;
  if (read(store, PRESERVED_KEY) !== null) return false;
  return write(store, SAVE_KEY, JSON.stringify(session.serialize()));
}

/** 玩家明确选择清除时调用：主存档与保留副本一起删除（这是唯一会删除存档的路径）。 */
export function clearGame(): void {
  const store = storage();
  if (!store) return;
  remove(store, SAVE_KEY);
  remove(store, PRESERVED_KEY);
}

/**
 * 下载原始存档备份。不使用系统时间，文件名固定；没有浏览器环境时返回 false。
 */
export function downloadSaveBackup(raw: string): boolean {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof Blob === 'undefined'
  ) {
    return false;
  }
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'lifesim-save-backup.json';
    anchor.click();
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Download failure is retryable, not save corruption: never preserve or overwrite in this step. */
export async function loadGameAsync(
  prepare: typeof loadRequiredPacks = loadRequiredPacks,
  progress?: PackProgress,
): Promise<SaveLoadResult> {
  const store = storage();
  const raw = store ? read(store, SAVE_KEY) : null;
  if (raw === null) return loadGame();
  let data;
  try {
    data = parseGameSave(JSON.parse(raw));
  } catch {
    return loadGame();
  }
  await prepare(data.request.region, progress);
  return loadGame();
}
