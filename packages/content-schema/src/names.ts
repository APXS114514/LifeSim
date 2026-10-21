import { z } from 'zod';
import { EvidenceGradeSchema, SourceIdSchema } from './evidence.ts';
import { SemverSchema } from './primitives.ts';

/**
 * 姓名表契约（ADR-0010 A2，任务 M3-045）。
 *
 * 存档只保存 `NameRef`（表 ID + 条目 ID），各语言写法留在表里（GDD §10）：
 * 切换语言只换写法，不重抽名字。表放在 `packages/country-packs/names/<PACK>/`。
 */

/** 命名方案（ADR-0010 A2）：决定显示顺序、是否有父称、婚后姓氏规则。 */
export const NAME_SCHEMES = ['zh', 'ja', 'ko', 'ru'] as const;
export const NameSchemeSchema = z.enum(NAME_SCHEMES);
export type NameScheme = z.infer<typeof NameSchemeSchema>;

/** 表的组成部分。ru 的父称是一张独立的 `given` 表（`ru-patronymic`）。 */
export const NAME_TABLE_KINDS = ['family', 'given'] as const;
export const NameTableKindSchema = z.enum(NAME_TABLE_KINDS);
export type NameTableKind = z.infer<typeof NameTableKindSchema>;

/** 条目适用性别；`any` 表示不限（中日韩的姓、ru 的姓与父称）。 */
export const NAME_ENTRY_SEXES = ['female', 'male', 'any'] as const;
export const NameEntrySexSchema = z.enum(NAME_ENTRY_SEXES);
export type NameEntrySex = z.infer<typeof NameEntrySexSchema>;

/**
 * 城乡适用范围（ADR-0010 A2.2「城乡权重（可选）」）。
 * 缺省表示城乡通用；只有拿到可核验的城乡差异来源时才填。
 */
export const NAME_ENTRY_SETTLEMENTS = ['urban', 'rural'] as const;
export const NameEntrySettlementSchema = z.enum(NAME_ENTRY_SETTLEMENTS);
export type NameEntrySettlement = z.infer<typeof NameEntrySettlementSchema>;

/** 表 ID 与条目 ID：小写字母、数字与连字符（`jp-given`、`hanako-f-c1`）。 */
export const NameIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: 'Name table and entry IDs use lowercase letters, digits and hyphens',
});

/** 适用出生年的合理边界：1880 是俄罗斯父称链最早的出生年，2026 是主角最晚的出生年。 */
export const NAME_BIRTH_YEAR_MIN = 1800;
export const NAME_BIRTH_YEAR_MAX = 2100;

const NameTextSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('{{'), {
    message: 'Name writings must not contain template markers',
  });

/** 一个写法：原文、简体中文、英文转写。三者都必须非空（ADR-0010 A2.2）。 */
export const NameFormSchema = z.strictObject({
  native: NameTextSchema,
  'zh-Hans': z.string().regex(/^[\u4e00-\u9fff·]+$/, {
    message: 'zh-Hans writings use Chinese characters and the middle dot only',
  }),
  en: z.string().regex(/^[A-Za-z][A-Za-z '-]*$/, {
    message: 'en writings use Latin letters, spaces, apostrophes and hyphens',
  }),
});
export type NameForm = z.infer<typeof NameFormSchema>;

/** ru 的姓与父称随性别变形，同一个条目带阴性与阳性两套写法。 */
export const GenderedNameFormsSchema = z.strictObject({
  feminine: NameFormSchema,
  masculine: NameFormSchema,
});
export type GenderedNameForms = z.infer<typeof GenderedNameFormsSchema>;

/** 适用出生年区间 `[from, to]`（闭区间，可多段）。 */
export const NameBirthSpanSchema = z
  .tuple([
    z.number().int().min(NAME_BIRTH_YEAR_MIN).max(NAME_BIRTH_YEAR_MAX),
    z.number().int().min(NAME_BIRTH_YEAR_MIN).max(NAME_BIRTH_YEAR_MAX),
  ])
  .refine(([from, to]) => from <= to, {
    message: 'Name birth spans must be [from, to] with from <= to',
  });
export type NameBirthSpan = z.infer<typeof NameBirthSpanSchema>;

/**
 * 姓名表条目。`weight` 是相对频率权重，`grade` 是这个权重的证据等级
 * （没有频率表的地区一律 D 级设计假设）。
 */
export const NameEntrySchema = z.strictObject({
  id: NameIdSchema,
  sex: NameEntrySexSchema,
  born: z.array(NameBirthSpanSchema).min(1),
  settlement: NameEntrySettlementSchema.optional(),
  weight: z.number().gt(0),
  grade: EvidenceGradeSchema,
  forms: NameFormSchema,
  genderedForms: GenderedNameFormsSchema.optional(),
  sourceIds: z.array(SourceIdSchema).min(1),
});
export type NameEntry = z.infer<typeof NameEntrySchema>;

export const NameTableSchema = z
  .strictObject({
    id: NameIdSchema,
    scheme: NameSchemeSchema,
    kind: NameTableKindSchema,
    version: SemverSchema,
    entries: z.array(NameEntrySchema).min(1),
  })
  .superRefine((table, ctx) => {
    const seen = new Set();
    table.entries.forEach((entry, index) => {
      if (seen.has(entry.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate name entry id ${entry.id}`,
          path: ['entries', index, 'id'],
        });
      }
      seen.add(entry.id);

      // ru 的姓与父称一个条目服务两种性别，因此必须同时带阴性、阳性两套写法；
      // 其他条目按性别分开，带 genderedForms 说明数据建模错了。
      const needsGenderedForms = table.scheme === 'ru' && entry.sex === 'any';
      if (needsGenderedForms && entry.genderedForms === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `ru entry ${entry.id} with sex "any" requires genderedForms (feminine and masculine)`,
          path: ['entries', index, 'genderedForms'],
        });
      }
      if (!needsGenderedForms && entry.genderedForms !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `entry ${entry.id} may only carry genderedForms when scheme is ru and sex is "any"`,
          path: ['entries', index, 'genderedForms'],
        });
      }
    });
  });
export type NameTable = z.infer<typeof NameTableSchema>;

/** 存档里的名字引用（GDD §10：只存表引用，不存显示字符串）。 */
export const NameRefSchema = z.strictObject({
  table: NameIdSchema,
  id: NameIdSchema,
});
export type NameRef = z.infer<typeof NameRefSchema>;

/** 角色姓名（ADR-0010 A2.1）。`null` 只表示该地区与年代有数据缺口，不是「没有名字」。 */
export const PersonNameSchema = z
  .strictObject({
    scheme: NameSchemeSchema,
    family: NameRefSchema.nullable(),
    given: NameRefSchema.nullable(),
    patronymic: NameRefSchema.nullable(),
  })
  .superRefine((name, ctx) => {
    if (name.scheme !== 'ru' && name.patronymic !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'patronymic is only used by the ru scheme',
        path: ['patronymic'],
      });
    }
  });
export type PersonName = z.infer<typeof PersonNameSchema>;
