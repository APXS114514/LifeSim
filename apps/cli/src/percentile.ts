// 百分位与取整：分层批量报告（M5-001）用；与 apps/cli/src/bench.ts 的算法逐位一致。
//
// bench.ts 自己留着一份同样的 percentile，本任务不改它（任务文件「禁止修改」），
// 所以这里是同一算法的第二个使用者；两处结果必须逐位一致。

/** 最近秩法：`rank = ceil(p/100 × n)`，取第 rank 个（从 1 计）元素。空数组返回 0。 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

/** 中位数：偶数个取中间两个的平均。空数组返回 0。 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** 按小数位取整：报告里所有浮点都过它，浮点尾巴不会进入指纹。 */
export function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}
