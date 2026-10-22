/**
 * 端到端测试与本地诊断用的故障注入（M4-020c）。
 *
 * 只在测试显式写入 `globalThis.__lifesimQaFault` 时生效，读取一次就删除；正常游玩时这个键不存在，
 * 行为与没有这段代码完全一致。它让 Playwright 能验证两条真实错误路径：
 *
 * - `cohort-calculation`：四个人的计算抛错（组件显示「计算出错」并允许重试）；
 * - `cohort-render`：面板渲染抛错（React 错误边界接管）；
 * - `survival-gap`：让生命表在指定年龄之后返回 `null`，验证「数据缺失」标注。
 *
 * 不要把它当成产品功能或外部输入：只接受下面三种形状，其他值一律忽略。
 */

export type QaFault =
  | { readonly kind: 'cohort-calculation' }
  | { readonly kind: 'cohort-render' }
  | { readonly kind: 'survival-gap'; readonly fromAge: number };

export const QA_FAULT_KEY = '__lifesimQaFault';

function parseFault(value: unknown): QaFault | null {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return null;
  const kind = value.kind;
  if (kind === 'cohort-calculation' || kind === 'cohort-render') return { kind };
  if (kind === 'survival-gap' && 'fromAge' in value) {
    const fromAge = value.fromAge;
    if (typeof fromAge === 'number' && Number.isInteger(fromAge) && fromAge >= 0) {
      return { kind, fromAge };
    }
  }
  return null;
}

/** 读取并消费一次注入的故障；没有注入时返回 null。 */
export function takeQaFault(): QaFault | null {
  const host = globalThis as Record<string, unknown>;
  const value = host[QA_FAULT_KEY];
  if (value === undefined) return null;
  delete host[QA_FAULT_KEY];
  return parseFault(value);
}
