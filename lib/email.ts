import { Resend } from "resend";
import { SITE_URL } from "@/lib/site";

// Lazy singleton — `new Resend(undefined)` throws immediately at construction
// (not just on .send()), so this must not run at module load time or it
// breaks the build/boot whenever RESEND_API_KEY isn't set.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// Resend's shared test sender — works with no domain verification. Switch to
// your own verified domain (e.g. "Galaxus <noreply@yourdomain.com>") once set up.
const FROM = "Galaxus <onboarding@resend.dev>";

function wrapperHtml(title: string, bodyHtml: string): string {
  return `
  <div style="background:#070b18;padding:40px 20px;font-family:system-ui,sans-serif;">
    <div style="max-width:420px;margin:0 auto;background:#0a0e1c;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;">
      <p style="color:#818cf8;font-size:20px;font-weight:700;margin:0 0 24px;">✦ Galaxus</p>
      <h1 style="color:white;font-size:18px;margin:0 0 12px;">${title}</h1>
      <div style="color:rgba(255,255,255,0.65);font-size:14px;line-height:1.6;">${bodyHtml}</div>
      <p style="color:rgba(255,255,255,0.25);font-size:12px;margin-top:32px;">Built by Plansio</p>
    </div>
  </div>`;
}

export async function sendPasswordResetEmail(to: string, rawToken: string) {
  const url = `${SITE_URL}/reset-password/${rawToken}`;
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set — password reset link for ${to}: ${url}`);
    return;
  }
  await getResend().emails.send({
    from: FROM,
    to,
    subject: "Reset your Galaxus password",
    html: wrapperHtml(
      "Reset your password",
      `<p>Someone requested a password reset for this account. This link expires in 1 hour.</p>
       <p><a href="${url}" style="color:#818cf8;">Reset your password →</a></p>
       <p>If you didn't request this, you can safely ignore this email.</p>`
    ),
  });
}

export async function sendVerificationEmail(to: string, rawToken: string) {
  const url = `${SITE_URL}/verify-email/${rawToken}`;
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set — verification link for ${to}: ${url}`);
    return;
  }
  await getResend().emails.send({
    from: FROM,
    to,
    subject: "Verify your Galaxus email",
    html: wrapperHtml(
      "Verify your email",
      `<p>Welcome to Galaxus! Confirm your email to finish setting up your account.</p>
       <p><a href="${url}" style="color:#818cf8;">Verify your email →</a></p>`
    ),
  });
}
