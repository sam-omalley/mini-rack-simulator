/** Escape a single CSV cell (quote when it contains a comma, quote, or newline). */
export function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise a 2D array of rows to a CSV string. */
export function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
