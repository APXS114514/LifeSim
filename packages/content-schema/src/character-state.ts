import { z } from 'zod';
import { PersonNameSchema } from './names.ts';
import { EntityIdSchema, ISODateSchema, compareISODate } from './primitives.ts';

/**
 * 人生原则的价值维度（GDD §6.2）：代理决策按这些偏好给可行行动打分。
 * 权重是 0–1 的相对偏好，不要求加总为 1。
 */
export const LIFE_PRINCIPLE_KEYS = [
  'family',
  'wealth',
  'health',
  'knowledge',
  'risk',
  'stability',
] as const;
export type LifePrincipleKey = (typeof LIFE_PRINCIPLE_KEYS)[number];

const weight = z.number().min(0).max(1);

export const LifePrinciplesSchema = z.strictObject({
  family: weight,
  wealth: weight,
  health: weight,
  knowledge: weight,
  risk: weight,
  stability: weight,
});
export type LifePrinciples = z.infer<typeof LifePrinciplesSchema>;

/** 死亡状态必须指向记录死亡的那条事实，死因只抽样一次（GDD §8.3）。 */
export const VitalStatusSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('alive') }),
  z.strictObject({
    kind: z.literal('deceased'),
    deathDate: ISODateSchema,
    deathFactId: EntityIdSchema,
  }),
]);
export type VitalStatus = z.infer<typeof VitalStatusSchema>;

/** 学历阶段（统一内部类别；各国学制在国家包里映射，GDD §8.2）。 */
export const EDUCATION_LEVELS = ['none', 'primary', 'secondary', 'tertiary'] as const;
export const EducationLevelSchema = z.enum(EDUCATION_LEVELS);
export type EducationLevel = z.infer<typeof EducationLevelSchema>;

/** 正在就读某阶段时，已完成的最高学历必须是它的前一阶段。 */
const PREREQUISITE: Record<Exclude<EducationLevel, 'none'>, EducationLevel> = {
  primary: 'none',
  secondary: 'primary',
  tertiary: 'secondary',
};

export const OriginSchema = z.strictObject({
  settlement: z.enum(['urban', 'rural']),
  familyResources: z.enum(['low', 'middle', 'high']),
});
export type Origin = z.infer<typeof OriginSchema>;

/** 出生时确定、之后不重抽的个人特质（GDD §6.3：已确定的经历不能被重抽）。 */
export const TraitsSchema = z.strictObject({
  /** 学业能力，0–1。 */
  aptitude: z.number().min(0).max(1),
});

export const EducationStateSchema = z.strictObject({
  /** 已完成的最高学历。 */
  completed: EducationLevelSchema,
  /** 正在就读的阶段；不在学为 null。 */
  enrolledIn: z.enum(['primary', 'secondary', 'tertiary']).nullable(),
  /** 最近一条教育事实，供后续事实引用为原因。 */
  lastFactId: EntityIdSchema.nullable(),
});

export const EMPLOYMENT_STATUSES = [
  'child',
  'student',
  'not-in-labor-force',
  'employed',
  'unemployed',
  'retired',
] as const;

export const EmploymentStateSchema = z.strictObject({
  status: z.enum(EMPLOYMENT_STATUSES),
  /** 受雇或领养老金时按哪一级学历计薪；其他状态为 null。 */
  wageLevel: EducationLevelSchema.nullable(),
  lastFactId: EntityIdSchema.nullable(),
});

/** 疾病是持续状态（GDD §8.3）：发病后一直存在，可能接受治疗。 */
export const HealthConditionSchema = z.strictObject({
  id: z.string().min(1),
  onset: ISODateSchema,
  treated: z.boolean(),
  factId: EntityIdSchema,
});

export const HealthStateSchema = z.strictObject({
  conditions: z.array(HealthConditionSchema),
});

/** 个人财务的指针：钱在 `householdAccounts` 里，这里只记账户和最近一次年度结算的事实。 */
export const FinanceStateSchema = z.strictObject({
  accountId: EntityIdSchema.nullable(),
  lastSettlementFactId: EntityIdSchema.nullable(),
});

/**
 * 主角或已实例化 NPC 的底层状态（GDD §6.1、§6.3）。
 *
 * - `tier`：主角、Tier1 核心亲友、Tier2 一般人物；Tier3 统计人口不逐人实例化。
 * - 地理字段彼此分离（GDD §5）：出生地不可变，居住地、政治归属、国籍各自变化。
 * - 健康/幸福/经济/知识/关系等表层指标不存储，由底层状态的函数派生。
 * - 个人财产在 `SimulationSnapshot.householdAccounts`，角色只通过 `finance` 指向账户。
 *
 * 技能、职业资格、关系与婚育等字段在 M3 按 GDD §6.1、§8 补充。
 */
export const CharacterSexSchema = z.enum(['female', 'male']);
export type CharacterSex = z.infer<typeof CharacterSexSchema>;
export const SkillSchema = z.strictObject({
  id: z.string().regex(/^(?:interest|skill):[a-z0-9]+(?:-[a-z0-9]+)*$/),
  level: weight,
  since: ISODateSchema,
});
export type Skill = z.infer<typeof SkillSchema>;

export const CharacterStateSchema = z
  .strictObject({
    id: EntityIdSchema,
    tier: z.enum(['protagonist', 'tier1', 'tier2']),
    sex: CharacterSexSchema,
    name: PersonNameSchema,
    wellbeing: z.strictObject({ stress: weight }),
    social: z.strictObject({ ties: weight }),
    skills: z.array(SkillSchema).max(12),
    birthDate: ISODateSchema,
    birthPlaceId: EntityIdSchema,
    currentResidenceId: EntityIdSchema,
    politicalEntityId: EntityIdSchema,
    citizenshipIds: z.array(EntityIdSchema),
    vitalStatus: VitalStatusSchema,
    lifePrinciples: LifePrinciplesSchema,
    origin: OriginSchema,
    traits: TraitsSchema,
    education: EducationStateSchema,
    employment: EmploymentStateSchema,
    health: HealthStateSchema,
    finance: FinanceStateSchema,
  })
  .superRefine((character, ctx) => {
    const { vitalStatus, education, employment } = character;
    const skillIds = new Set<string>();
    character.skills.forEach((skill, index) => {
      if (skillIds.has(skill.id))
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate skill id',
          path: ['skills', index, 'id'],
        });
      skillIds.add(skill.id);
      if (compareISODate(skill.since, character.birthDate) < 0)
        ctx.addIssue({
          code: 'custom',
          message: 'Skill cannot precede birth',
          path: ['skills', index, 'since'],
        });
    });
    if (
      vitalStatus.kind === 'deceased' &&
      compareISODate(vitalStatus.deathDate, character.birthDate) < 0
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'deathDate cannot precede birthDate',
        path: ['vitalStatus', 'deathDate'],
      });
    }
    if (education.enrolledIn && education.completed !== PREREQUISITE[education.enrolledIn]) {
      ctx.addIssue({
        code: 'custom',
        message: `Enrolled in ${education.enrolledIn} without completing ${PREREQUISITE[education.enrolledIn]}`,
        path: ['education'],
      });
    }
    if ((employment.status === 'student') !== (education.enrolledIn !== null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Employment status "student" must match being enrolled',
        path: ['employment', 'status'],
      });
    }
    const paid = employment.status === 'employed' || employment.status === 'retired';
    if (paid !== (employment.wageLevel !== null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'wageLevel is set exactly when employed or retired',
        path: ['employment', 'wageLevel'],
      });
    }
  });
export type CharacterState = z.infer<typeof CharacterStateSchema>;
