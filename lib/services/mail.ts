// Gmail via an app password: SMTP to send (lands in your Sent folder like any
// email), IMAP to read REPLIES to Galaxus's own emails. Stored encrypted.
//
// Why an app password, not "Sign in with Google": no Google Cloud project, no
// server env vars (Vercel is locked), and no 7-day expiry that unverified
// OAuth apps get. Trade-off: the password could read the whole mailbox, so
// this code only ever opens messages that answer an email Galaxus sent.

import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getSecret, setSecret } from "@/lib/services/secrets";

export type GmailCreds = { email: string; appPassword: string; name?: string };

export async function gmailCredsFor(userId: number): Promise<GmailCreds | null> {
  const raw = await getSecret(userId, "gmail");
  try {
    return raw ? (JSON.parse(raw) as GmailCreds) : null;
  } catch {
    return null;
  }
}

function transport(c: GmailCreds) {
  return nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: c.email, pass: c.appPassword } });
}

function imap(c: GmailCreds) {
  return new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: c.email, pass: c.appPassword }, logger: false });
}

/** Save after proving both sending and reading work. "" disconnects. */
export async function connectGmailFor(userId: number, input: { email: string; appPassword: string; name?: string } | null) {
  if (!input || !input.email.trim()) {
    await setSecret(userId, "gmail", null);
    return;
  }
  const c: GmailCreds = { email: input.email.trim().toLowerCase(), appPassword: input.appPassword.replace(/\s+/g, ""), name: input.name?.trim() || undefined };
  if (!/^[^@\s]+@(gmail|googlemail)\.com$|^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(c.email)) throw new Error("Enter your full email address.");
  if (!/^[a-z]{16}$/i.test(c.appPassword)) throw new Error("A Gmail app password is 16 letters (Google shows it in 4 groups of 4).");
  try {
    await transport(c).verify();
  } catch {
    throw new Error("Gmail refused the login — check the address and that you used an app password (2-Step Verification must be on).");
  }
  const client = imap(c);
  try {
    await client.connect();
    await client.logout();
  } catch {
    throw new Error("Sending works, but reading replies (IMAP) failed — make sure IMAP is enabled in Gmail settings → Forwarding and POP/IMAP.");
  }
  await setSecret(userId, "gmail", JSON.stringify(c));
}

export async function sendMailFor(
  userId: number,
  m: { to: string; subject: string; text: string; inReplyTo?: string | null; references?: string[] }
): Promise<string> {
  const c = await gmailCredsFor(userId);
  if (!c) throw new Error("Connect Gmail first.");
  const info = await transport(c).sendMail({
    from: c.name ? `"${c.name.replace(/"/g, "")}" <${c.email}>` : c.email,
    to: m.to,
    subject: m.subject,
    text: m.text,
    ...(m.inReplyTo ? { inReplyTo: m.inReplyTo, references: [...(m.references ?? []), m.inReplyTo] } : {}),
  });
  return info.messageId;
}

export type IncomingReply = { messageId: string; inReplyTo: string | null; references: string[]; from: string; subject: string; text: string; date: Date };

/**
 * New messages from the last few days that answer one of OUR emails
 * (matched by In-Reply-To / References, or by sender address). Nothing else
 * in the mailbox is opened or parsed.
 */
export async function fetchRepliesFor(userId: number, ours: { messageIds: Set<string>; addresses: Set<string> }, sinceDays = 4): Promise<IncomingReply[]> {
  const c = await gmailCredsFor(userId);
  if (!c || (ours.messageIds.size === 0 && ours.addresses.size === 0)) return [];
  const client = imap(c);
  const out: IncomingReply[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - sinceDays * 86_400_000);
      const uids = (await client.search({ since }, { uid: true })) || [];
      if (uids.length === 0) return [];
      // Headers first (cheap); only matching messages get downloaded.
      const matches: number[] = [];
      for await (const msg of client.fetch(uids, { uid: true, envelope: true, headers: ["in-reply-to", "references"] }, { uid: true })) {
        const headers = msg.headers?.toString() ?? "";
        const refs = headers.match(/<[^>]+>/g) ?? [];
        const from = msg.envelope?.from?.[0]?.address?.toLowerCase() ?? "";
        if (refs.some((r) => ours.messageIds.has(r)) || ours.addresses.has(from)) matches.push(msg.uid);
      }
      for (const uid of matches.slice(-30)) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const refs = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];
        out.push({
          messageId: parsed.messageId ?? `uid-${uid}`,
          inReplyTo: parsed.inReplyTo ?? null,
          references: refs,
          from: parsed.from?.value?.[0]?.address?.toLowerCase() ?? "",
          subject: parsed.subject ?? "",
          // Keep only the new part of the reply (drop the quoted thread).
          text: (parsed.text ?? "").split(/\n(?:On .{5,120} wrote:|-{2,} ?Original Message|>{1,})/)[0].trim().slice(0, 4000),
          date: parsed.date ?? new Date(),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}
