import type { SimEventFact, SimulationSnapshot } from '@lifesim/content-schema';

/**
 * 存档仓库接口（GDD §11.4）。IndexedDB 实现在 M4 落地；模拟内核与 UI 只依赖这个接口，
 * 测试可以换成内存实现。事件事实只追加：已写入的事实不修改、不删除（迁移另走审计记录）。
 */
export interface SaveRepository {
  saveSnapshot(saveId: string, snapshot: SimulationSnapshot): Promise<void>;
  appendFacts(saveId: string, facts: readonly SimEventFact[]): Promise<void>;
  readSnapshot(saveId: string): Promise<SimulationSnapshot>;
  getFacts(saveId: string, fromSequence: number): Promise<SimEventFact[]>;
  exportSave(saveId: string): Promise<Uint8Array>;
  importSave(bytes: Uint8Array): Promise<string>;
}
