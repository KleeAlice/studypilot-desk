import { useState } from "react";
import { SettingsIcon, type SettingsIconName } from "./SettingsIcon";

export interface SettingsSectionItem {
  id: string;
  icon: SettingsIconName;
  label: string;
}

export function SettingsSectionNav({
  items,
  label = "设置分类",
}: {
  items: SettingsSectionItem[];
  label?: string;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id || "");

  function selectSection(id: string) {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <nav aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={activeId === item.id ? "is-active" : ""}
          aria-current={activeId === item.id ? "location" : undefined}
          onClick={() => selectSection(item.id)}
        >
          <SettingsIcon name={item.icon} />
          {item.label}
        </button>
      ))}
    </nav>
  );
}
