interface StreakRingProps {
  value: number;
  max?: number;
  size?: number;
  color?: string;
  label: string;
  sublabel?: string;
}

export function StreakRing({
  value,
  max = 30,
  size = 80,
  color = "var(--gold)",
  label,
  sublabel,
}: StreakRingProps) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="oklch(1 0 0 / 6%)"
            strokeWidth={6}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold leading-none" style={{ color }}>
            {value}
          </span>
          <span className="text-[9px] text-muted-foreground leading-none mt-0.5">
            {sublabel ?? "days"}
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center leading-tight">{label}</p>
    </div>
  );
}
