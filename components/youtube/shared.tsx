import { cn } from "@/lib/utils";
import { SEVERITY_ORDER, type Issue, type Severity } from "@/lib/youtube";

export const SEVERITY_DOT: Record<Severity, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-muted-foreground/40",
};

export function IssueList({ issues, empty }: { issues: Issue[]; empty?: string }) {
  if (issues.length === 0) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  return (
    <ul className="space-y-3">
      {[...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]).map((i) => (
        <li key={i.code} className="flex gap-3">
          <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", SEVERITY_DOT[i.severity])} aria-label={`${i.severity} priority`} />
          <div>
            <p className="text-sm font-medium">{i.title}</p>
            <p className="text-sm text-muted-foreground">{i.fix}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Claude's plain-text reports: ALL-CAPS lines become headings. */
export function ReportText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split("\n").map((line, i) =>
        /^[A-Z][A-Z0-9 ()&/–-]{2,}$/.test(line.trim())
          ? <p key={i} className="pt-3 first:pt-0 text-xs font-semibold tracking-wide text-muted-foreground">{line.trim()}</p>
          : line.trim() ? <p key={i}>{line}</p> : null
      )}
    </div>
  );
}
