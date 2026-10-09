// Task attachments — links (videos, docs, repos) and images.
// Validated here once; used by the app, the API and the MCP tools.

export interface TaskAttachment {
  type: "link" | "image";
  url: string;
  title?: string;
}

export const MAX_ATTACHMENTS = 12;

/** Only http(s) URLs — never javascript:, data:, file: etc. */
export function isSafeUrl(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 2000) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function sanitizeAttachments(input: unknown): TaskAttachment[] {
  if (!Array.isArray(input)) return [];
  const out: TaskAttachment[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (!isSafeUrl(r.url)) continue;
    const type = r.type === "image" ? "image" : "link";
    const title = typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 120) : undefined;
    out.push({ type, url: r.url, ...(title ? { title } : {}) });
    if (out.length >= MAX_ATTACHMENTS) break;
  }
  return out;
}

/** Short label for a link: its title, else the domain ("youtube.com"). */
export function attachmentLabel(a: TaskAttachment): string {
  if (a.title) return a.title;
  try {
    return new URL(a.url).hostname.replace(/^www\./, "");
  } catch {
    return a.url;
  }
}
