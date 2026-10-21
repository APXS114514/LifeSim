import { gzipSync } from 'node:zlib';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readTextFile, sha256File } from './files.mjs';

let directory = '';

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'lifesim-data-'));
  writeFileSync(join(directory, 'plain.txt'), 'hello\nworld\n', 'utf8');
  writeFileSync(join(directory, 'plain.txt.gz'), gzipSync(Buffer.from('hello\nworld\n', 'utf8')));
  writeFileSync(join(directory, 'abc.txt'), 'abc', 'utf8');
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('readTextFile', () => {
  it('reads plain text and gzip text identically', () => {
    expect(readTextFile(join(directory, 'plain.txt'))).toBe('hello\nworld\n');
    expect(readTextFile(join(directory, 'plain.txt.gz'))).toBe('hello\nworld\n');
  });
});

describe('sha256File', () => {
  it('returns the lower-case SHA-256 of the file content', () => {
    expect(sha256File(join(directory, 'abc.txt'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
