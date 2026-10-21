import { GameSession, parseGameSave } from './session.ts';

const SAVE_KEY = 'lifesim.save.v1';

/** 自动存档只是本机便利功能；存储不可用时静默跳过，不影响游戏。 */
export function saveGame(session: GameSession): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(session.serialize()));
  } catch {
    // 隐私模式、配额不足或存储被禁用：下次仍可从头开始。
  }
}

export function loadGame(): GameSession | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) return null;
    return GameSession.restore(parseGameSave(JSON.parse(raw)));
  } catch {
    clearGame();
    return null;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 忽略：没有可清理的存储。
  }
}
