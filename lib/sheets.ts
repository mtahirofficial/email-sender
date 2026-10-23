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

// ---- parsing ---------------------------------------------------------------

export type SheetItem = { row: number; website: string | null; email: string; sent: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 * A row with a website starts a group; every email below it (until the next
 * website) belongs to that website, so a blank website cell inherits the one
 * above (this also handles merged cells, which only hold a value in their first row).
 * A non-empty "sent" cell means that address is already handled.
 */
export function parseSheet(values: string[][], cols: { website: number; email: number; sent: number }): SheetItem[] {
  const items: SheetItem[] = [];
  let website: string | null = null;

  values.forEach((row, index) => {
    const found = normalizeWebsite(row[cols.website] ?? "");
    if (found) website = found;

    const email = (row[cols.email] ?? "").trim();
    if (EMAIL.test(email)) {
      items.push({ row: index + 1, website, email, sent: Boolean((row[cols.sent] ?? "").trim()) });
    }
  });
  return items;
}
