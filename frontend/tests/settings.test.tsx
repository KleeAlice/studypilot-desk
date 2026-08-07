import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Settings } from "../src/features/Settings";
import { applyGlassOpacity, applyWallpaper } from "../src/ui/appearance";


test("settings changes interface and code fonts with an immediate preview", async () => {
  const onTypography = vi.fn().mockResolvedValue(undefined);
  const api = {
    put: vi.fn().mockResolvedValue({ saved: true }),
    post: vi.fn().mockResolvedValue({ path: "C:/Study/backup.zip" }),
  } as any;

  render(
    <Settings
      api={api}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      onTheme={vi.fn()}
      onTypography={onTypography}
    />,
  );

  await userEvent.selectOptions(screen.getByLabelText("界面字体"), "song");
  await userEvent.selectOptions(screen.getByLabelText("代码字体"), "consolas");

  await waitFor(() => {
    expect(onTypography).toHaveBeenCalledWith("ui_font", "song");
    expect(onTypography).toHaveBeenCalledWith("code_font", "consolas");
  });
  expect(screen.getByText("知识会在连接中生长").style.fontFamily).toContain("SimSun");
  expect(screen.getByText("def learn(topic):").style.fontFamily).toContain("Consolas");
});

test("settings persists an English interface option and applies it immediately", async () => {
  const onLanguage = vi.fn().mockResolvedValue(undefined);
  render(
    <Settings
      api={{ put: vi.fn(), post: vi.fn() } as any}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      initialLanguage="zh-CN"
      onTheme={vi.fn()}
      onTypography={vi.fn().mockResolvedValue(undefined)}
      onLanguage={onLanguage}
    />,
  );

  await userEvent.selectOptions(screen.getByLabelText("界面语言"), "en-US");
  expect(onLanguage).toHaveBeenCalledWith("en-US");
});

test("wallpaper opacity stays continuous without a binary clarity threshold", () => {
  applyWallpaper("http://127.0.0.1:9000", "custom", "1", .94);
  expect(document.documentElement.style.getPropertyValue("--app-wallpaper-opacity")).toBe("0.94");
  expect(document.documentElement.dataset.wallpaperClarity).toBeUndefined();

  applyWallpaper("http://127.0.0.1:9000", "custom", "1", .95);
  expect(document.documentElement.style.getPropertyValue("--app-wallpaper-opacity")).toBe("0.95");
  expect(document.documentElement.dataset.wallpaperClarity).toBeUndefined();
});

test("liquid glass opacity applies globally and persists from settings", async () => {
  applyGlassOpacity(.47);
  expect(document.documentElement.style.getPropertyValue("--glass-opacity")).toBe("47%");

  const onGlassOpacity = vi.fn().mockResolvedValue(undefined);
  render(
    <Settings
      api={{ put: vi.fn(), post: vi.fn() } as any}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      initialGlassOpacity={0.32}
      onTheme={vi.fn()}
      onTypography={vi.fn().mockResolvedValue(undefined)}
      onGlassOpacity={onGlassOpacity}
    />,
  );

  const opacity = screen.getByRole("slider", { name: "液态玻璃透明度" });
  expect(opacity).toHaveValue("0.32");
  expect(screen.getByText("32%")).toBeInTheDocument();
  fireEvent.change(opacity, { target: { value: "0.61" } });
  expect(onGlassOpacity).toHaveBeenCalledWith(0.61);
  expect(screen.getByText("61%")).toBeInTheDocument();
});

test("settings exposes every discovered system font and global size choices", async () => {
  const onTypography = vi.fn().mockResolvedValue(undefined);
  const onFontScale = vi.fn().mockResolvedValue(undefined);
  const api = {
    put: vi.fn().mockResolvedValue({ saved: true }),
    post: vi.fn().mockResolvedValue({ path: "C:/Study/backup.zip" }),
  } as any;

  render(
    <Settings
      api={api}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      systemFonts={["Aptos", "Microsoft YaHei UI", "cjkFonts 全瀨體", "Noto Sans SC", "霞鹜文楷"]}
      initialFontScale={1}
      onTheme={vi.fn()}
      onTypography={onTypography}
      onFontScale={onFontScale}
    />,
  );

  const uiFont = screen.getByLabelText("界面字体") as HTMLSelectElement;
  const localGroup = [...uiFont.querySelectorAll("optgroup")]
    .find((group) => group.label === "全部本机字体（5）");
  expect(localGroup).toBeTruthy();
  expect([...uiFont.querySelectorAll("optgroup")].some((group) => group.label.includes("CJKFonts"))).toBe(false);
  expect([...localGroup!.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
    "Aptos",
    "cjkFonts 全瀨體",
    "Microsoft YaHei UI",
    "Noto Sans SC",
    "霞鹜文楷",
  ]);
  expect(localGroup?.querySelector('option[value="local:cjkFonts 全瀨體"]')).toBeTruthy();

  await userEvent.selectOptions(uiFont, "local:cjkFonts 全瀨體");
  await userEvent.selectOptions(screen.getByLabelText("界面字体"), "local:霞鹜文楷");
  await userEvent.selectOptions(screen.getByLabelText("界面字号"), "1.4");

  expect(onTypography).toHaveBeenCalledWith("ui_font", "local:cjkFonts 全瀨體");
  expect(onTypography).toHaveBeenCalledWith("ui_font", "local:霞鹜文楷");
  expect(onFontScale).toHaveBeenCalledWith(1.4);
});

test("legacy font scales resolve to one of the four supported size choices", () => {
  render(
    <Settings
      api={{ put: vi.fn(), post: vi.fn() } as any}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      initialFontScale={0.95}
      onTheme={vi.fn()}
      onTypography={vi.fn().mockResolvedValue(undefined)}
    />,
  );

  const size = screen.getByRole("combobox", { name: "界面字号" });
  expect(size).toHaveValue("1");
  expect([...size.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
    "小 · 12px 正文",
    "标准 · 14px 正文",
    "大 · 17px 正文",
    "超大 · 20px 正文",
    "自定义 · 21–32px 正文",
  ]);
});

test("custom interface size keeps values above 20px and applies one global scale", async () => {
  const onFontScale = vi.fn().mockResolvedValue(undefined);
  render(
    <Settings
      api={{ put: vi.fn(), post: vi.fn() } as any}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      initialFontScale={22 / 14}
      onTheme={vi.fn()}
      onTypography={vi.fn().mockResolvedValue(undefined)}
      onFontScale={onFontScale}
    />,
  );

  expect(screen.getByRole("combobox", { name: "界面字号" })).toHaveValue("custom");
  const customSize = screen.getByRole("spinbutton", { name: "自定义界面字号" });
  expect(customSize).toHaveValue(22);
  await userEvent.clear(customSize);
  await userEvent.type(customSize, "24");
  fireEvent.blur(customSize);
  expect(onFontScale).toHaveBeenLastCalledWith(24 / 14);
});

test("force uniform font size is an explicit optional preference", async () => {
  const onForceUniformFontSize = vi.fn().mockResolvedValue(undefined);
  render(
    <Settings
      api={{ put: vi.fn(), post: vi.fn() } as any}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      initialForceUniformFontSize={false}
      onTheme={vi.fn()}
      onTypography={vi.fn().mockResolvedValue(undefined)}
      onForceUniformFontSize={onForceUniformFontSize}
    />,
  );

  const toggle = screen.getByRole("checkbox", { name: "强制所有界面文字使用同一字号" });
  expect(toggle).not.toBeChecked();
  await userEvent.click(toggle);
  expect(onForceUniformFontSize).toHaveBeenCalledWith(true);
});

test("settings previews preset wallpapers and uploads or clears a local image", async () => {
  const onWallpaperMode = vi.fn().mockResolvedValue(undefined);
  const onWallpaperUpload = vi.fn().mockResolvedValue(undefined);
  const onWallpaperClear = vi.fn().mockResolvedValue(undefined);
  const api = {
    put: vi.fn().mockResolvedValue({ saved: true }),
    post: vi.fn().mockResolvedValue({ path: "C:/Study/backup.zip" }),
  } as any;
  render(
    <Settings
      api={api}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      initialWallpaperMode="none"
      onTheme={vi.fn()}
      onTypography={vi.fn().mockResolvedValue(undefined)}
      onWallpaperMode={onWallpaperMode}
      onWallpaperUpload={onWallpaperUpload}
      onWallpaperClear={onWallpaperClear}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "晨雾壁纸" }));
  const file = new File([new Uint8Array([137, 80, 78, 71])], "wallpaper.png", { type: "image/png" });
  await userEvent.upload(screen.getByLabelText("选择本地壁纸"), file);
  await userEvent.click(screen.getByRole("button", { name: "清除壁纸" }));

  expect(onWallpaperMode).toHaveBeenCalledWith("dawn");
  expect(onWallpaperUpload).toHaveBeenCalledWith(file);
  expect(onWallpaperClear).toHaveBeenCalled();
});

test("settings adjusts wallpaper visibility with an immediate percentage readout", async () => {
  const onWallpaperOpacity = vi.fn().mockResolvedValue(undefined);
  render(
    <Settings
      api={{ put: vi.fn(), post: vi.fn() } as any}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      initialWallpaperMode="custom"
      initialWallpaperOpacity={0.65}
      onTheme={vi.fn()}
      onTypography={vi.fn().mockResolvedValue(undefined)}
      onWallpaperOpacity={onWallpaperOpacity}
    />,
  );

  const opacity = screen.getByRole("slider", { name: "壁纸可见度" });
  expect(opacity).toHaveValue("65");
  expect(screen.getByText("65%")).toBeInTheDocument();
  fireEvent.change(opacity, { target: { value: "42" } });
  expect(onWallpaperOpacity).toHaveBeenCalledWith(0.42);
});

test("wallpaper visibility reaches true zero and exposes an independent blur control", async () => {
  const onWallpaperBlur = vi.fn().mockResolvedValue(undefined);
  const onWallpaperOpacity = vi.fn().mockResolvedValue(undefined);
  render(<Settings api={{ put: vi.fn(), post: vi.fn() } as any} runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any} initialTheme="light" initialUiFont="system" initialCodeFont="system" initialWallpaperMode="custom" initialWallpaperOpacity={0} initialWallpaperBlur={18} onTheme={vi.fn()} onTypography={vi.fn().mockResolvedValue(undefined)} onWallpaperOpacity={onWallpaperOpacity} onWallpaperBlur={onWallpaperBlur} />);
  expect(screen.getByRole("slider", { name: "壁纸可见度" })).toHaveValue("0");
  expect(screen.getByRole("slider", { name: "壁纸模糊程度" })).toHaveValue("18");
  fireEvent.change(screen.getByRole("slider", { name: "壁纸模糊程度" }), { target: { value: "28" } });
  expect(onWallpaperBlur).toHaveBeenCalledWith(28);
});

test("settings disables automatic workspace toolbar hiding immediately", async () => {
  const onWorkspaceToolbarAutoHide = vi.fn().mockResolvedValue(undefined);
  render(
    <Settings
      api={{ put: vi.fn(), post: vi.fn() } as any}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      initialWorkspaceToolbarAutoHide
      onTheme={vi.fn()}
      onTypography={vi.fn().mockResolvedValue(undefined)}
      onWorkspaceToolbarAutoHide={onWorkspaceToolbarAutoHide}
    />,
  );

  const toggle = screen.getByRole("checkbox", { name: "自动隐藏资料与知识工具栏" });
  expect(toggle).toBeChecked();
  await userEvent.click(toggle);
  expect(toggle).not.toBeChecked();
  expect(onWorkspaceToolbarAutoHide).toHaveBeenCalledWith(false);
});

test("settings changes, resets, and opens the unified archive directory", async () => {
  const onChooseExportDirectory = vi.fn().mockResolvedValue("D:/StudyPilot Archive");
  const onResetExportDirectory = vi.fn().mockResolvedValue("C:/Study/data/exports");
  const onOpenExportDirectory = vi.fn().mockResolvedValue(undefined);
  const api = { put: vi.fn(), post: vi.fn() } as any;

  render(
    <Settings
      api={api}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      exportDirectory="C:/Study/data/exports"
      onTheme={vi.fn()}
      onTypography={vi.fn().mockResolvedValue(undefined)}
      onChooseExportDirectory={onChooseExportDirectory}
      onResetExportDirectory={onResetExportDirectory}
      onOpenExportDirectory={onOpenExportDirectory}
    />,
  );

  expect(screen.getByText("C:/Study/data/exports")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "更改存档目录" }));
  expect(await screen.findByText("D:/StudyPilot Archive")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "打开存档目录" }));
  await userEvent.click(screen.getByRole("button", { name: "恢复默认存档目录" }));

  expect(onChooseExportDirectory).toHaveBeenCalled();
  expect(onOpenExportDirectory).toHaveBeenCalled();
  expect(onResetExportDirectory).toHaveBeenCalled();
});

test("the AI settings action opens the real PILOT model panel instead of staying disabled", async () => {
  const listener = vi.fn();
  window.addEventListener("studypilot:open-agent", listener);
  try {
    render(
      <Settings
        api={{ put: vi.fn(), post: vi.fn() } as any}
        runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
        initialTheme="light"
        initialUiFont="system"
        initialCodeFont="system"
        onTheme={vi.fn()}
        onTypography={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const button = screen.getByRole("button", { name: "管理模型配置" });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ view: "settings" });
  } finally {
    window.removeEventListener("studypilot:open-agent", listener);
  }
});

test("settings category buttons scroll without replacing the hash route", async () => {
  const originalHash = window.location.hash;
  window.history.replaceState({}, "", "#/courses/7/settings");
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  render(
    <Settings
      api={{ put: vi.fn(), post: vi.fn() } as any}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      onTheme={vi.fn()}
      onTypography={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  const navigation = screen.getByRole("navigation", { name: "设置分类" });
  expect(navigation).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /字体与字号/ }));

  expect(window.location.hash).toBe("#/courses/7/settings");
  expect(scrollIntoView).toHaveBeenCalledWith({
    behavior: "smooth",
    block: "start",
  });
  expect(document.querySelectorAll(".settings-panel").length).toBeGreaterThanOrEqual(6);

  window.history.replaceState({}, "", originalHash || "#/");
});
