import { useEffect, useState } from "react";
import type { UiLanguage } from "../ui/language";
import { SettingsIcon } from "./SettingsIcon";

export function WorkspaceToolbarPreferences({
  autoHide,
  language = "zh-CN",
  variant = "course",
  onChange,
}: {
  autoHide: boolean;
  language?: UiLanguage;
  variant?: "course" | "global";
  onChange: (value: boolean) => Promise<void>;
}) {
  const english = language === "en-US";
  const [enabled, setEnabled] = useState(autoHide);

  useEffect(() => setEnabled(autoHide), [autoHide]);

  async function change(value: boolean) {
    const previous = enabled;
    setEnabled(value);
    try {
      await onChange(value);
    } catch {
      setEnabled(previous);
    }
  }

  return (
    <section id="settings-workspace" className={`${variant === "global" ? "global-settings-card " : ""}settings-panel workspace-toolbar-preferences`}>
      <div className="settings-panel__header">
        <span className="settings-panel__icon"><SettingsIcon name="workspace" /></span>
        <div>
          <h2>{english ? "Workspace toolbars" : "工作区工具栏"}</h2>
        </div>
      </div>
      <label className="setting-switch">
        <input
          type="checkbox"
          aria-label={english ? "Auto-hide document and knowledge toolbars" : "自动隐藏资料与知识工具栏"}
          checked={enabled}
          onChange={(event) => void change(event.target.checked)}
        />
        <span>{english ? "Auto-hide document and knowledge toolbars" : "自动隐藏资料与知识工具栏"}</span>
      </label>
      <p>{english
        ? "Move the pointer to the top of the workspace to show both toolbars."
        : "将鼠标移动到工作区顶部，可同时显示资料与知识工具栏。"}</p>
    </section>
  );
}
