import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

/**
 * 读取文本文件；路径以 .gz 结尾时先用 gunzip 解压。按 UTF-8 解码。
 * @param {string} path
 * @returns {string}
 */
export function readTextFile(path) {
  const buffer = readFileSync(path);
  return (path.endsWith('.gz') ? gunzipSync(buffer) : buffer).toString('utf8');
}

/**
 * 文件内容的 SHA-256，小写十六进制。
 * @param {string} path
 * @returns {string}
 */
export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
