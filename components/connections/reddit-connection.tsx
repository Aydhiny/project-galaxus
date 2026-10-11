"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveRedditConnectionC, testRedditConnectionC, type RedditConnection } from "@/lib/client/reddit";
import { BrandTile } from "@/components/brand-icon";

/**
 * Reddit on the Connections tab. One free "script app" key serves two things:
 * Gig radar (reads hiring posts) and the Game dev → Reddit section (reads each
 * community's rules and threads). Galaxus only reads Reddit — you post yourself.
 */
export function RedditConnectionCard({ connection }: { connection: RedditConnection }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [username, setUsername] = useState(connection.username ?? "");
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();

  const keyTyped = clientId.trim() || clientSecret.trim();
  const usernameChanged = username.trim() !== (connection.username ?? "");

  function save() {
    start(async () => {
      try {
        await saveRedditConnectionC({ clientId, clientSecret, username });
        setClientId("");
        setClientSecret("");
        setTest(null);
        toast.success(keyTyped ? "Reddit connected." : "Saved.");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-start gap-3">
        <BrandTile name="reddit" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Reddit</h2>
            {connection.connected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <Check className="w-3 h-3" /> Key saved
              </span>
            ) : (
              <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">Key needed</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reads hiring posts for Gig radar and each community&apos;s rules for your game&apos;s Reddit posts. Galaxus never posts, comments or votes — you do.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="grid sm:grid-cols-2 gap-2">
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" aria-label="Reddit client ID"
            placeholder={connection.connected ? "Client ID · paste to replace" : "Client ID (under your app's name)"} className="input-base" />
          <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" aria-label="Reddit client secret"
            placeholder={connection.connected ? "Secret · paste to replace" : "Secret"} className="input-base" />
        </div>
        <div className="flex gap-2">
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" aria-label="Reddit username"
            placeholder="Your Reddit username (optional)" className="input-base flex-1" />
          <button onClick={save} disabled={busy || (!keyTyped && !usernameChanged)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
          <button
            onClick={() => start(async () => {
              try { setTest(await testRedditConnectionC()); } catch (e) { setTest({ ok: false, message: e instanceof Error ? e.message : "Test failed." }); }
            })}
            disabled={busy} className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
            Test
          </button>
          {connection.connected && (
            <button
              onClick={() => {
                if (!window.confirm("Remove the Reddit key? Gig radar uses it too, and both fall back to Reddit's public feed (which often blocks servers).")) return;
                start(async () => {
                  try { await saveRedditConnectionC(null); setTest(null); toast.success("Reddit key removed."); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove."); }
                });
              }}
              disabled={busy} aria-label="Remove Reddit key"
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {test && (
          <p className={cn("rounded-lg px-3 py-2 text-xs", test.ok ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "bg-red-500/10 text-red-700 dark:text-red-300")}>{test.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          The username goes in the request header, as Reddit&apos;s API rules ask — apps that say who they are get blocked less.
        </p>
      </div>

      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium hover:text-foreground">How to get the key (free, 2 minutes)</summary>
        <ol className="mt-2 list-decimal pl-4 space-y-1">
          <li>Open <a className="underline" href="https://www.reddit.com/prefs/apps" target="_blank" rel="noreferrer">reddit.com/prefs/apps</a> and choose <b>create another app</b>.</li>
          <li>Pick type <b>script</b>, any name, and <code>http://localhost:8080</code> as the redirect URI.</li>
          <li>The <b>client ID</b> is the short text under the app&apos;s name; the <b>secret</b> is the longer one. Paste both above.</li>
          <li>Reddit may ask you to request API access first — if so, say it&apos;s a personal tool that only reads public pages.</li>
        </ol>
      </details>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
        <Link href="/game/reddit" className="inline-flex items-center gap-1 text-sm font-medium hover:underline underline-offset-4">Game Reddit <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/gigs" className="inline-flex items-center gap-1 text-sm font-medium hover:underline underline-offset-4">Gig radar <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </section>
  );
}
