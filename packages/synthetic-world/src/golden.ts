/**
 * 合成人生的黄金指纹：固定种子与出生日期跑完一生，全部事实的规范 JSON 的指纹。
 *
 * **高风险文件。** 它锁定规则、数据与随机算法的整体行为；修改需要架构审查（PR 加 `arch-approved` 标签）。
 * 只有在规则或数据**有意**改变、并确认差异合理之后才能更新，提交说明里必须写明原因。
 * 为了让测试通过而改这里，等于删除了确定性测试。
 */
// User approved M3-041: 65 yearly-focus audits added; 85 previous facts preserve content and causes.
// User approved M3-042: 20 life-event prototypes add 150 prototype facts + 7 non-major choices;
// the 150 previous facts keep their content and causes (only 48 settlement balances differ from spending).
export const GOLDEN_LIFE = {
  seed: 'golden-1',
  birthDate: '1960-03-15',
  factCount: 307,
  fingerprint: 'bd77b163672cd6f299e60c2f6060a866',
} as const;
