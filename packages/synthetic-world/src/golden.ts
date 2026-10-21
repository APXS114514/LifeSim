/**
 * 合成人生的黄金指纹：固定种子与出生日期跑完一生，全部事实的规范 JSON 的指纹。
 *
 * **高风险文件。** 它锁定规则、数据与随机算法的整体行为；修改需要架构审查（PR 加 `arch-approved` 标签）。
 * 只有在规则或数据**有意**改变、并确认差异合理之后才能更新，提交说明里必须写明原因。
 * 为了让测试通过而改这里，等于删除了确定性测试。
 */
export const GOLDEN_LIFE = {
  seed: 'golden-1',
  birthDate: '1960-03-15',
  factCount: 72,
  fingerprint: 'b4b67de5d12b1a4827e238ad2051d292',
} as const;
