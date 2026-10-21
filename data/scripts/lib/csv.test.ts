import { describe, expect, it } from 'vitest';
import { parseCsv, readCsvRecords } from './csv.mjs';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('"China, Hong Kong SAR",344\n')).toEqual([['China, Hong Kong SAR', '344']]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('"say ""hi""",x\n')).toEqual([['say "hi"', 'x']]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('"line1\nline2",x\n')).toEqual([['line1\nline2', 'x']]);
  });

  it('handles CRLF, a leading BOM and a missing final newline', () => {
    expect(parseCsv('\ufeffa,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reports the starting line of an unterminated quoted field', () => {
    expect(() => parseCsv('a,b\n1,"oops\n2,3\n')).toThrow(/line 2/);
  });
});

describe('readCsvRecords', () => {
  it('uses the trimmed first row as the header', () => {
    expect(readCsvRecords('LocID,Location\n156,China\n')).toEqual([
      { LocID: '156', Location: 'China' },
    ]);
    expect(readCsvRecords(' LocID , Location \n156,China\n')).toEqual([
      { LocID: '156', Location: 'China' },
    ]);
  });

  it('skips totally blank lines', () => {
    expect(readCsvRecords('a,b\n1,2\n\n3,4\n')).toHaveLength(2);
  });

  it('rejects rows with a different field count and reports the line', () => {
    expect(() => readCsvRecords('a,b\n1,2\n3\n')).toThrow(/line 3/);
  });
});
