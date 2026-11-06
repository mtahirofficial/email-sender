// Minimal Google Sheets v4 client plus the parser for the outreach layout:
// website in one column (only on the first row of its group), that website's
// emails in the next column, one per row, and a "sent" column for ticks.

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export class SheetsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function sheetsFetch(accessToken: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    console.error("sheets api error", res.status, (await res.text()).slice(0, 300));
    if (res.status === 404) throw new SheetsError(400, "Sheet not found, or this Google account can't open it.");
    if (res.status === 403)
      throw new SheetsError(400, "Google refused access. Make sure the Google Sheets API is enabled and the sheet is shared with the connected Google account.");
    if (res.status === 401) throw new SheetsError(400, "Google access expired. Enable Google Sheets again.");
    throw new SheetsError(502, "Could not reach Google Sheets right now. Please try again.");
  }
  return res.json();
}

/** Pulls the spreadsheet id (and optional tab gid) out of a Google Sheets link. */
export function parseSpreadsheetUrl(input: string): { id: string; gid: string | null } | null {
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(input);
  if (!match) return null;
  return { id: match[1], gid: /[?#&]gid=(\d+)/.exec(input)?.[1] ?? null };
}

export async function resolveSheetTitle(accessToken: string, id: string, gid: string | null): Promise<string> {
  const data = await sheetsFetch(accessToken, `${BASE}/${id}?fields=sheets.properties(sheetId,title)`);
  const tabs: { sheetId: number; title: string }[] = (data.sheets ?? []).map((s: { properties: { sheetId: number; title: string } }) => s.properties);
  const tab = (gid ? tabs.find((t) => String(t.sheetId) === gid) : undefined) ?? tabs[0];
  if (!tab) throw new SheetsError(400, "That spreadsheet has no tabs.");
  return tab.title;
}

const quote = (title: string) => `'${title.replace(/'/g, "''")}'`;

/** Column letter (A to Z) to zero-based index. */
export const colIndex = (letter: string) => letter.toUpperCase().charCodeAt(0) - 65;

/** Reads columns A through `lastCol`. Row n of the sheet is element n-1 of the result. */
export async function readValues(accessToken: string, id: string, title: string, lastCol: string): Promise<string[][]> {
  const range = encodeURIComponent(`${quote(title)}!A:${lastCol}`);
  const data = await sheetsFetch(accessToken, `${BASE}/${id}/values/${range}?majorDimension=ROWS`);
  return (data.values ?? []) as string[][];
}

export async function writeCells(accessToken: string, id: string, title: string, col: string, entries: { row: number; text: string }[]) {
  if (entries.length === 0) return;
  await sheetsFetch(accessToken, `${BASE}/${id}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: entries.map((e) => ({ range: `${quote(title)}!${col}${e.row}`, values: [[e.text]] })),
    }),
  });
}

// ---- link and colouring -----------------------------------------------------

const tabIdCache = new Map<string, number>();

/** Numeric id of a tab (the "gid" in a sheet link), found by its title and remembered. */
export async function resolveTabId(accessToken: string, id: string, title: string): Promise<number | null> {
  const key = `${id}:${title}`;
  const cached = tabIdCache.get(key);
  if (cached !== undefined) return cached;
  const data = await sheetsFetch(accessToken, `${BASE}/${id}?fields=sheets.properties(sheetId,title)`);
  const tab = (data.sheets ?? []).map((s: { properties: { sheetId: number; title: string } }) => s.properties).find((p: { title: string }) => p.title === title);
  if (!tab) return null;
  tabIdCache.set(key, tab.sheetId);
  return tab.sheetId;
}

/** A link that opens the spreadsheet on the right tab. Falls back to the plain link if the tab can't be found. */
export async function sheetUrlFor(accessToken: string, id: string, title: string): Promise<string> {
  const base = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  try {
    const gid = await resolveTabId(accessToken, id, title);
    return gid === null ? base : `${base}#gid=${gid}`;
  } catch {
    return base;
  }
}

const SENT_GREEN = { red: 0.78, green: 0.94, blue: 0.8 };

/**
 * Makes the "sent" cell of the given rows green and removes the green from every other row of that column
 * (row 1 is treated as a header and left alone). Calling it with today's rows keeps exactly today's emails green.
 */
export async function paintSentCells(accessToken: string, id: string, title: string, col: string, rows: number[]) {
  const sheetId = await resolveTabId(accessToken, id, title);
  if (sheetId === null) return;
  const c = colIndex(col);
  const requests: unknown[] = [
    { repeatCell: { range: { sheetId, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 }, cell: {}, fields: "userEnteredFormat.backgroundColor" } },
  ];
  const sorted = Array.from(new Set(rows)).filter((r) => r >= 2).sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++; // one request per run of neighbouring rows
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: sorted[i] - 1, endRowIndex: sorted[j], startColumnIndex: c, endColumnIndex: c + 1 },
        cell: { userEnteredFormat: { backgroundColor: SENT_GREEN } },
        fields: "userEnteredFormat.backgroundColor",
      },
    });
    i = j + 1;
  }
  await sheetsFetch(accessToken, `${BASE}/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
}

// ---- parsing ---------------------------------------------------------------

/** An extra sheet column the person added: its letter and the header they call it in their instructions. */
export type ExtraColumn = { col: string; header: string };
export const EXTRA_COLUMN_LIMIT = 8;

/** Cleans a saved/submitted list of extra columns: single letters, short unique headers, at most EXTRA_COLUMN_LIMIT. */
export function parseExtraCols(raw: unknown): ExtraColumn[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtraColumn[] = [];
  for (const entry of raw) {
    const col = typeof entry?.col === "string" ? entry.col.trim().toUpperCase() : "";
    const header = typeof entry?.header === "string" ? entry.header.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    if (!/^[A-Z]$/.test(col) || !header) continue;
    if (out.some((e) => e.col === col || e.header.toLowerCase() === header.toLowerCase())) continue;
    out.push({ col, header });
    if (out.length === EXTRA_COLUMN_LIMIT) break;
  }
  return out;
}

/** `fields`: the values of the extra columns for this row, by header (empty cells are left out). */
export type SheetItem = { row: number; website: string | null; email: string; sent: boolean; fields: Record<string, string> };

const EMAIL = /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;

// Scraped sheets often contain template addresses such as you@company.com.
const PLACEHOLDER_DOMAINS = new Set(["company.com", "example.com", "yourdomain.com", "domain.com", "email.com", "test.com", "website.com", "yoursite.com"]);

/** Every real-looking address in a cell, however it is separated (commas, spaces, new lines). */
export function extractEmails(text: string): string[] {
  const out: string[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    const email = token.replace(/^[<(\["'\u2713]+|[>)\]"'.,;]+$/g, "").toLowerCase();
    if (EMAIL.test(email) && !PLACEHOLDER_DOMAINS.has(email.split("@")[1]) && !out.includes(email)) out.push(email);
  }
  return out;
}

/** "https://www.hubspot.com/pricing" becomes "hubspot.com". */
export function normalizeWebsite(raw: string): string | null {
  const host = raw
    .trim()
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#\s]/)[0]
    .toLowerCase();
  return host || null;
}

/**
 * One row per website: the domain in one column, ALL its emails in another
 * (comma separated), and a "sent" column that records which addresses were
 * emailed ("\u2713 a@x.com, \u2713 b@x.com"). If the sent cell holds text without
 * any address (for example "unsub"), the whole row counts as handled.
 * An optional filter keeps only rows whose column equals a value (for example "Yes").
 */
export function parseSheet(
  values: string[][],
  cols: { website: number; email: number; sent: number; filter?: { col: number; value: string }; extras?: { col: number; header: string }[] }
): SheetItem[] {
  const items: SheetItem[] = [];

  values.forEach((row, index) => {
    if (cols.filter && (row[cols.filter.col] ?? "").trim().toLowerCase() !== cols.filter.value) return;

    const emails = extractEmails(row[cols.email] ?? "");
    if (emails.length === 0) return;

    const website = normalizeWebsite(row[cols.website] ?? "");
    const sentText = (row[cols.sent] ?? "").trim();
    const sentSet = new Set(extractEmails(sentText));
    const rowHandled = sentText !== "" && sentSet.size === 0;

    const fields: Record<string, string> = {};
    for (const extra of cols.extras ?? []) {
      const value = (row[extra.col] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (value) fields[extra.header] = value;
    }

    for (const email of emails) {
      items.push({ row: index + 1, website, email, sent: rowHandled || sentSet.has(email), fields });
    }
  });
  return items;
}
