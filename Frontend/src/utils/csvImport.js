// Pure helpers for importing a CSV file as a new table (no React, no network).
import { isValidIdentifier, isValidType, quoteIdent, sqlLiteral } from './sqlEdit';

export const MAX_IMPORT_ROWS = 20000;
export const MAX_IMPORT_COLUMNS = 100;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const CHUNK_BYTES = 60 * 1024; // Express JSON body limit is 100kb

// ── CSV parsing ─────────────────────────────────────────────────────────────

export function detectDelimiter(text) {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] || '';
  let best = ',', bestCount = -1;
  for (const d of [',', ';', '\t', '|']) {
    let count = 0, inQ = false;
    for (const ch of firstLine) {
      if (ch === '"') inQ = !inQ;
      else if (ch === d && !inQ) count++;
    }
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

// RFC-4180-ish: quoted fields, "" escapes, CRLF/LF/CR, BOM, embedded newlines.
export function parseCSV(input, delimiter) {
  let text = String(input || '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delim = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [], field = '', inQ = false, i = 0;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { inQ = true; i++; continue; }
    if (ch === delim) { endField(); i++; continue; }
    if (ch === '\r') { endRow(); i += text[i + 1] === '\n' ? 2 : 1; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) endRow();
  // drop fully blank lines
  const cleaned = rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
  return { delimiter: delim, rows: cleaned };
}

// ── names ───────────────────────────────────────────────────────────────────

export function sanitizeName(raw, fallback = 'column') {
  let s = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!s) s = fallback;
  if (/^[0-9]/.test(s)) s = `c_${s}`;
  return s.slice(0, 63);
}

export function sanitizeHeaders(headers) {
  const seen = new Set();
  return headers.map((h, idx) => {
    let base = sanitizeName(h, `column_${idx + 1}`);
    if (base === 'provsql') base = 'provsql_col';
    let name = base, n = 2;
    while (seen.has(name)) {
      const suffix = `_${n++}`;
      name = base.slice(0, 63 - suffix.length) + suffix;
    }
    seen.add(name);
    return name;
  });
}

// ── type inference ──────────────────────────────────────────────────────────

const RE_INT = /^[+-]?(0|[1-9][0-9]*)$/;
const RE_NUM = /^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/;
const RE_BOOL = /^(true|false)$/i;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_TS = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;

const validDate = (s) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const classify = (v) => {
  if (/^[+-]?0[0-9]+$/.test(v)) return 'TEXT'; // leading zeros (zip codes, ids) stay text
  if (RE_INT.test(v)) return Math.abs(Number(v)) > 2147483647 ? 'BIGINT' : 'INTEGER';
  if (RE_NUM.test(v)) return 'NUMERIC';
  if (RE_BOOL.test(v)) return 'BOOLEAN';
  if (RE_DATE.test(v)) return validDate(v) ? 'DATE' : 'TEXT';
  if (RE_TS.test(v)) return validDate(v) ? 'TIMESTAMP' : 'TEXT';
  return 'TEXT';
};

// Widening lattice: INTEGER < BIGINT < NUMERIC; DATE < TIMESTAMP; otherwise TEXT.
const merge = (a, b) => {
  if (a === null) return b;
  if (a === b) return a;
  const num = ['INTEGER', 'BIGINT', 'NUMERIC'];
  if (num.includes(a) && num.includes(b)) return num[Math.max(num.indexOf(a), num.indexOf(b))];
  if ((a === 'DATE' && b === 'TIMESTAMP') || (a === 'TIMESTAMP' && b === 'DATE')) return 'TIMESTAMP';
  return 'TEXT';
};

export function inferColumnType(values) {
  let t = null;
  for (const raw of values) {
    const v = String(raw ?? '').trim();
    if (v === '') continue; // empty => NULL
    t = merge(t, classify(v));
    if (t === 'TEXT') return 'TEXT';
  }
  return t || 'TEXT';
}

export const isNullValue = (v) => String(v ?? '').trim() === '';

// ── dataset assembly ────────────────────────────────────────────────────────

export function buildDataset(parsedRows, { hasHeader = true } = {}) {
  if (!parsedRows.length) throw new Error('The file is empty.');
  const width = Math.max(...parsedRows.map((r) => r.length));
  if (width > MAX_IMPORT_COLUMNS) throw new Error(`Too many columns (${width}); the limit is ${MAX_IMPORT_COLUMNS}.`);
  const header = hasHeader ? parsedRows[0] : Array.from({ length: width }, (_, i) => `column_${i + 1}`);
  const body = (hasHeader ? parsedRows.slice(1) : parsedRows).map((r) => {
    const out = r.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  });
  if (body.length > MAX_IMPORT_ROWS) throw new Error(`Too many rows (${body.length}); the limit is ${MAX_IMPORT_ROWS}.`);
  const names = sanitizeHeaders(Array.from({ length: width }, (_, i) => header[i] ?? ''));
  const types = names.map((_, c) => inferColumnType(body.map((r) => r[c])));
  return { columns: names.map((name, i) => ({ name, type: types[i] })), rows: body };
}

export const suggestTableName = (fileName) =>
  sanitizeName(String(fileName || '').replace(/\.[^.]*$/, ''), 'imported_table');

// ── validation + SQL ────────────────────────────────────────────────────────

// Returns a list of problems (empty = OK).
export function validateImport({ tableName, columns, existingTables = [] }) {
  const errs = [];
  if (!isValidIdentifier(tableName)) errs.push('Table name must start with a letter or underscore and use only letters, numbers and underscores.');
  else if (tableName.length > 63) errs.push('Table name is too long (max 63 characters).');
  else if (existingTables.some((t) => t.toLowerCase() === tableName.toLowerCase())) errs.push(`A table named "${tableName}" already exists.`);
  const seen = new Set();
  columns.forEach((c, i) => {
    if (!isValidIdentifier(c.name) || c.name.length > 63) errs.push(`Column ${i + 1}: invalid name "${c.name}".`);
    else if (c.name.toLowerCase() === 'provsql') errs.push(`Column ${i + 1}: "provsql" is reserved.`);
    else if (seen.has(c.name.toLowerCase())) errs.push(`Column ${i + 1}: duplicate name "${c.name}".`);
    seen.add(String(c.name).toLowerCase());
    if (!isValidType(c.type)) errs.push(`Column "${c.name}": unsupported type.`);
  });
  if (!columns.length) errs.push('No columns to import.');
  return errs;
}

export function buildCreateTableSQL(tableName, columns) {
  const defs = columns.map((c) => `${quoteIdent(c.name)} ${c.type}`).join(', ');
  return `CREATE TABLE ${quoteIdent(tableName)} (${defs})`;
}

const cell = (v, type) => {
  if (isNullValue(v)) return 'NULL';
  const t = String(v).trim();
  if (type === 'BOOLEAN') return t.toLowerCase() === 'true' ? 'TRUE' : 'FALSE';
  // Only a well-formed number is emitted bare; anything else (e.g. after a manual type override) is quoted so the DB rejects it safely.
  if (['INTEGER', 'BIGINT', 'NUMERIC'].includes(type) && RE_NUM.test(t)) return t;
  return sqlLiteral(type === 'TEXT' || /^(VARCHAR|CHAR|CHARACTER)/i.test(type) ? v : t);
};

// Splits rows into INSERT statements that each stay under CHUNK_BYTES.
export function buildInsertChunks(tableName, columns, rows, maxBytes = CHUNK_BYTES) {
  const head = `INSERT INTO ${quoteIdent(tableName)} (${columns.map((c) => quoteIdent(c.name)).join(', ')}) VALUES `;
  const chunks = [];
  let parts = [], size = head.length;
  for (const r of rows) {
    const tuple = `(${columns.map((c, i) => cell(r[i], c.type)).join(', ')})`;
    if (parts.length && size + tuple.length + 2 > maxBytes) {
      chunks.push(head + parts.join(', '));
      parts = []; size = head.length;
    }
    parts.push(tuple); size += tuple.length + 2;
  }
  if (parts.length) chunks.push(head + parts.join(', '));
  return chunks;
}
