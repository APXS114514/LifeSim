// 通用 CSV 工具（RFC 4180 风格）：WPP 的地名可能带逗号，不能按 split(',') 解析。

/**
 * 把 CSV 文本解析为行，每行是字段字符串数组。
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  let source = text;
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);

  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let fieldStartLine = 1;
  let index = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (index < source.length) {
    const char = source[index];

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      if (char === '\n') line += 1;
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === '') {
      inQuotes = true;
      fieldStartLine = line;
      index += 1;
      continue;
    }

    if (char === ',') {
      pushField();
      fieldStartLine = line;
      index += 1;
      continue;
    }

    if (char === '\n' || char === '\r') {
      pushRow();
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      line += 1;
      fieldStartLine = line;
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (inQuotes) {
    throw new Error(`Unterminated quoted CSV field starting on line ${fieldStartLine}`);
  }

  if (row.length > 0 || field !== '') pushRow();
  return rows;
}

/**
 * 以第一行为表头，返回对象数组；字段数与表头不一致时抛错。
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
export function readCsvRecords(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = /** @type {string[]} */ (rows[0]).map((name) => name.trim());
  /** @type {Record<string, string>[]} */
  const records = [];

  for (let index = 1; index < rows.length; index += 1) {
    const cells = /** @type {string[]} */ (rows[index]);
    if (cells.every((cell) => cell.trim() === '')) continue;
    if (cells.length !== header.length) {
      throw new Error(
        `CSV line ${index + 1}: expected ${header.length} fields, got ${cells.length}`,
      );
    }
    /** @type {Record<string, string>} */
    const record = {};
    header.forEach((name, column) => {
      record[name] = cells[column] ?? '';
    });
    records.push(record);
  }

  return records;
}
