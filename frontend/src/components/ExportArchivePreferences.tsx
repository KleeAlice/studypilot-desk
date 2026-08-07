import { SettingsIcon } from "./SettingsIcon";

export function ExportArchivePreferences({
  variant = "course",
  directory,
  onChoose,
  onReset,
  onOpen,
}: {
  variant?: "course" | "global";
  directory: string;
  onChoose: () => Promise<string | null>;
  onReset: () => Promise<string>;
  onOpen: () => Promise<void>;
}) {
  const className = variant === "global" ? "global-settings-card settings-panel export-archive-card" : "settings-panel export-archive-card";
  return (
    <section id="settings-archive" className={className}>
      <div className="settings-panel__header">
        <span className="settings-panel__icon"><SettingsIcon name="archive" /></span>
        <div>
          <h2>导出存档</h2>
        </div>
      </div>
      <div className="export-archive-controls">
        <code className="path-code">{directory}</code>
        <div>
          <button aria-label="更改存档目录" onClick={() => void onChoose()}>更改目录</button>
          <button aria-label="打开存档目录" onClick={() => void onOpen()}>打开文件夹</button>
          <button aria-label="恢复默认存档目录" onClick={() => void onReset()}>恢复默认</button>
        </div>
      </div>
    </section>
  );
}
