import {
  EntityIdSchema,
  IndicatorSchema,
  ISODateSchema,
  SourceIdSchema,
} from '@lifesim/content-schema';
import { z } from 'zod';

/**
 * 统计口径断点（ADR-0005 §5）：断点日期所在年份前后属于不同口径。
 * 相邻年份回退不能跨越断点；不同指标的断点彼此独立。
 */
export const BreakpointSchema = z.strictObject({
  id: z.string().min(1),
  /** 断点适用的地理单位。 */
  geographyIds: z.array(EntityIdSchema).min(1),
  /** 断点日期：该日期所在年份前后属于不同口径。 */
  date: ISODateSchema,
  /** 只影响这些指标；不同指标的口径断点不同（例如币制改革不影响出生数）。 */
  indicators: z.array(IndicatorSchema).min(1),
  reason: z.string().min(1),
  sourceIds: z.array(SourceIdSchema).min(1),
});
export type Breakpoint = z.infer<typeof BreakpointSchema>;
