import type { CSSProperties } from "react";

type GlassOpacityPreferenceProps = {
  value: number;
  onChange: (value: number) => Promise<void>;
  language?: "zh-CN" | "en-US";
};

export function GlassOpacityPreference({
  value,
  onChange,
  language = "zh-CN",
}: GlassOpacityPreferenceProps) {
  const english = language === "en-US";
  const percent = Math.round(value * 100);
  return (
    <div className="glass-opacity-preference">
      <div className="glass-opacity-preference__copy">
        <strong>{english ? "Liquid glass opacity" : "液态玻璃透明度"}</strong>
        <span>
          {english
            ? "0% is fully transparent; 100% is fully opaque. This applies to every page."
            : "0% 完全通透，100% 完全不透明；所有页面同步生效。"}
        </span>
      </div>
      <output aria-live="polite">{percent}%</output>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        aria-label={english ? "Liquid glass opacity" : "液态玻璃透明度"}
        onChange={(event) => void onChange(Number(event.target.value))}
        style={{ "--glass-range-progress": `${percent}%` } as CSSProperties}
      />
      <div className="glass-opacity-preference__preview" aria-hidden="true">
        <i />
        <span>{english ? "Live preview" : "实时预览"}</span>
      </div>
    </div>
  );
}
