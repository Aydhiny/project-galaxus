"use client";

import Link from "next/link";
import { Loader2, CheckCircle2, ListTodo, Repeat, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared shell for every auth screen (login, register, forgot, reset,
 * verify). Calm and token-based — follows the app's light/dark theme instead
 * of the old hard-coded navy, so it matches what you see after signing in.
 */
export function AuthShell({
  title, subtitle, children, footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1fr_1.05fr] bg-background text-foreground">
      {/* Brand panel (desktop) */}
      <aside className="hidden lg:flex flex-col justify-between p-12 border-r border-border bg-sidebar">
        <Link href="/" className="flex items-center gap-2.5 w-fit">
          <LogoMark />
          <span className="font-semibold tracking-tight">Galaxus</span>
        </Link>
        <div className="max-w-sm">
          <p className="text-3xl font-semibold tracking-tight leading-tight">
            Plan the day. Do the work. <span className="text-muted-foreground">See it add up.</span>
          </p>
          <ul className="mt-8 space-y-4 text-sm text-muted-foreground">
            <Feature icon={ListTodo}>Tasks with today &amp; tomorrow planning</Feature>
            <Feature icon={Repeat}>Routines that show up on their own</Feature>
            <Feature icon={BarChart3}>Points, streaks and a weekly review</Feature>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground" dir="rtl" lang="ar">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم</p>
      </aside>

      {/* Form column */}
      <main className="flex flex-col justify-center px-5 py-10 sm:px-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-[380px] mx-auto">
          <Link href="/" className="lg:hidden flex items-center gap-2.5 w-fit mb-10">
            <LogoMark />
            <span className="font-semibold tracking-tight">Galaxus</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center w-8 h-8 rounded-[9px] bg-foreground text-background text-sm", className)} aria-hidden>
      ✦
    </span>
  );
}

function Feature({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-lg border border-border bg-background flex items-center justify-center">
        <Icon className="w-4 h-4 text-foreground/80" />
      </span>
      {children}
    </li>
  );
}

/** Label + input, consistent sizing (16px text on mobile prevents iOS zoom-on-focus). */
export function AuthField({
  id, label, hint, trailing, className, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {hint}
      </div>
      <div className="relative">
        <input
          id={id}
          {...props}
          className={cn(
            "w-full h-11 rounded-lg border border-input bg-card px-3.5 text-base sm:text-sm placeholder:text-muted-foreground/60",
            "focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/20 transition-shadow",
            trailing ? "pr-11" : "",
            className
          )}
        />
        {trailing && <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    </div>
  );
}

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
      {children}
    </p>
  );
}

export function AuthSubmit({ loading, children }: { loading?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60 transition-colors"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
}

export function AuthSuccess({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <CheckCircle2 className="w-9 h-9 mx-auto text-emerald-500" />
      <p className="font-semibold mt-3">{title}</p>
      {children && <p className="text-sm text-muted-foreground mt-1">{children}</p>}
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-foreground underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
