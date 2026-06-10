import { cn } from "@/lib/utils";

interface PageHeaderProps {
  label?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ label, title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        {label && (
          <p className="section-label mb-1">{label}</p>
        )}
        <h1
          className="text-2xl font-bold heading-gradient"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
