import type { AgentMode } from "./types";


export function AgentModeSwitch({
  value,
  disabled = false,
  onChange,
}: {
  value: AgentMode;
  disabled?: boolean;
  onChange: (mode: AgentMode) => void;
}) {
  return (
    <div className="agent-mode-switch" role="tablist" aria-label="PILOT 模式">
      {([
        ["assistant", "助手"],
        ["learning", "学习"],
      ] as const).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={value === mode}
          disabled={disabled}
          onClick={() => onChange(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
