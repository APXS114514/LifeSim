import { z } from 'zod';
import {
  SimEventFactSchema,
  SimulationSnapshotSchema,
  checkJournalInvariants,
} from '@lifesim/content-schema';

/**
 * 导出文件格式：外层信封记录格式版本与载荷校验和，载荷是快照加完整事件日志的 JSON 字符串。
 * 校验和覆盖载荷字符串的 UTF-8 字节，因此不需要规范化 JSON。
 */
export const SAVE_FORMAT = 'lifesim-save';
export const SAVE_FORMAT_VERSION = 1;

/** 导入大小上限的默认值；M5 用真实长人生存档的体积再校准（GDD §14.3）。 */
export const DEFAULT_MAX_SAVE_BYTES = 32 * 1024 * 1024;

const SaveEnvelopeSchema = z.strictObject({
  format: z.literal(SAVE_FORMAT),
  formatVersion: z.number().int().positive(),
  engineVersion: z.string().min(1),
  /** 由调用方传入的导出时间（ISO 8601），保持本包不读取系统时钟。 */
  exportedAt: z.iso.datetime({ offset: true }),
  payloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
  payload: z.string(),
});

export const SavePayloadSchema = z
  .strictObject({
    snapshot: SimulationSnapshotSchema,
    facts: z.array(SimEventFactSchema).min(1),
  })
  .superRefine((payload, ctx) => {
    for (const issue of checkJournalInvariants(payload.facts, { complete: true })) {
      ctx.addIssue({ code: 'custom', message: `journal: ${issue.kind}`, path: ['facts'] });
    }
    const last = payload.facts.at(-1);
    if (last && last.sequence !== payload.snapshot.lastJournalSequence) {
      ctx.addIssue({
        code: 'custom',
        message: 'snapshot.lastJournalSequence does not match the last fact',
        path: ['snapshot', 'lastJournalSequence'],
      });
    }
  });
export type SavePayload = z.infer<typeof SavePayloadSchema>;

export interface SaveMetadata {
  engineVersion: string;
  exportedAt: string;
}

export type SaveDecodeError =
  | 'too-large'
  | 'not-utf8'
  | 'not-json'
  | 'forbidden-key'
  | 'bad-envelope'
  | 'unsupported-version'
  | 'checksum-mismatch'
  | 'bad-payload';

export type SaveDecodeResult =
  | { ok: true; payload: SavePayload; engineVersion: string; exportedAt: string }
  | { ok: false; error: SaveDecodeError; detail?: string };

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

class ForbiddenKeyError extends Error {}

/** JSON.parse，但拒绝可能在后续合并对象时造成原型污染的键（GDD §11.4）。 */
function parseJsonRejectingForbiddenKeys(text: string): unknown {
  return JSON.parse(text, (key, value: unknown) => {
    if (FORBIDDEN_KEYS.has(key)) throw new ForbiddenKeyError(key);
    return value;
  });
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function encodeSave(
  payload: SavePayload,
  metadata: SaveMetadata,
): Promise<Uint8Array<ArrayBuffer>> {
  const payloadText = JSON.stringify(SavePayloadSchema.parse(payload));
  const encoder = new TextEncoder();
  const envelope = {
    format: SAVE_FORMAT,
    formatVersion: SAVE_FORMAT_VERSION,
    engineVersion: metadata.engineVersion,
    exportedAt: metadata.exportedAt,
    payloadSha256: await sha256Hex(encoder.encode(payloadText)),
    payload: payloadText,
  };
  return encoder.encode(JSON.stringify(envelope));
}

/**
 * 校验一份导入的存档：大小 → UTF-8 → JSON（拒绝危险键）→ 信封 schema → 版本
 * → 校验和 → 载荷 schema 与事件日志不变量。任何一步失败都整体拒绝，不做部分导入。
 */
export async function decodeSave(
  bytes: Uint8Array,
  options: { maxBytes?: number } = {},
): Promise<SaveDecodeResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_SAVE_BYTES;
  if (bytes.byteLength > maxBytes) return { ok: false, error: 'too-large' };

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: 'not-utf8' };
  }

  const parsedEnvelope = parseGuarded(text);
  if (!parsedEnvelope.ok) return parsedEnvelope;
  const envelope = SaveEnvelopeSchema.safeParse(parsedEnvelope.value);
  if (!envelope.success) {
    return { ok: false, error: 'bad-envelope', detail: envelope.error.message };
  }
  if (envelope.data.formatVersion !== SAVE_FORMAT_VERSION) {
    return { ok: false, error: 'unsupported-version', detail: String(envelope.data.formatVersion) };
  }

  const actualSha256 = await sha256Hex(new TextEncoder().encode(envelope.data.payload));
  if (actualSha256 !== envelope.data.payloadSha256) {
    return { ok: false, error: 'checksum-mismatch' };
  }

  const parsedPayload = parseGuarded(envelope.data.payload);
  if (!parsedPayload.ok) return parsedPayload;
  const payload = SavePayloadSchema.safeParse(parsedPayload.value);
  if (!payload.success) return { ok: false, error: 'bad-payload', detail: payload.error.message };

  return {
    ok: true,
    payload: payload.data,
    engineVersion: envelope.data.engineVersion,
    exportedAt: envelope.data.exportedAt,
  };
}

function parseGuarded(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: SaveDecodeError; detail?: string } {
  try {
    return { ok: true, value: parseJsonRejectingForbiddenKeys(text) };
  } catch (error) {
    if (error instanceof ForbiddenKeyError) {
      return { ok: false, error: 'forbidden-key', detail: error.message };
    }
    return { ok: false, error: 'not-json' };
  }
}
