export function ProgressRing({ value, label = "今日进度" }: { value: number; label?: string }) {
  const normalized = Math.max(0, Math.min(100, value));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - normalized / 100);

  return (
    <div
      className="sp-progress-ring"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized}
    >
      <svg viewBox="0 0 104 104" aria-hidden="true">
        <circle className="sp-progress-ring__track" cx="52" cy="52" r={radius} />
        <circle
          className="sp-progress-ring__value"
          cx="52"
          cy="52"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span><strong>{normalized}</strong><small>%</small></span>
    </div>
  );
}
