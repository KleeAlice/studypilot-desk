export type SettingsIconName = "general" | "theme" | "startup" | "type" | "wallpaper" | "workspace" | "archive" | "data" | "model";

export function SettingsIcon({ name, className = "settings-icon" }: { name: SettingsIconName; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...common}>
      {name === "general" && <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.7 2.2M9 4.6l1 2m5-2-1 2" /></>}
      {name === "theme" && <><path d="M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-2.2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2Z" /><circle cx="7.5" cy="11" r=".8" /><circle cx="9.5" cy="7.5" r=".8" /><circle cx="7.8" cy="15" r=".8" /></>}
      {name === "startup" && <><path d="M8 4h8a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" /><path d="m10 9 5 3-5 3Z" /></>}
      {name === "type" && <><path d="M5 6V4h14v2M12 4v16M8 20h8" /></>}
      {name === "wallpaper" && <><rect x="3.5" y="4" width="17" height="16" rx="3" /><circle cx="9" cy="9" r="1.6" /><path d="m5.5 17 4.2-4.2 2.7 2.6 2.1-2 4 3.6" /></>}
      {name === "workspace" && <><rect x="3.5" y="4" width="17" height="16" rx="3" /><path d="M8.5 4v16M8.5 9h12" /></>}
      {name === "archive" && <><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6" /></>}
      {name === "data" && <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>}
      {name === "model" && <><path d="M8 4h8l4 4v8l-4 4H8l-4-4V8Z" /><circle cx="9" cy="11" r="1" /><circle cx="15" cy="11" r="1" /><path d="M9 16h6" /></>}
    </svg>
  );
}
