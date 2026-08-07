import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";


test("success feedback uses the success color for text, border and surface", () => {
  const css = readFileSync(resolve("frontend/src/styles/global.css"), "utf8");
  const successRule = css.match(/^\.success-message\s*\{([^}]+)\}/m)?.[1] || "";

  expect(successRule).toContain("var(--green)");
  expect(successRule).toMatch(/background:[^;]*var\(--green\)/);
});

test("the agent panel and new messages have distinct entrance motion", () => {
  const css = readFileSync(resolve("frontend/src/styles/agent.css"), "utf8");
  const dockKeyframes = css.match(/@keyframes agent-dock-in\s*\{([\s\S]*?)\n\}/)?.[1] || "";

  expect(dockKeyframes).toContain("opacity: 0");
  expect(dockKeyframes).toMatch(/translateX\((?:4[0-9]|[5-9][0-9])px\)/);
  expect(css).toMatch(/\.agent-message\.is-user\s*\{[^}]*animation:/);
  expect(css).toMatch(/\.agent-message\.is-assistant\s*\{[^}]*animation:/);
  expect(css).toContain("@keyframes agent-message-user-in");
  expect(css).toContain("@keyframes agent-message-assistant-in");
});

test("the split divider exposes a deliberate resize affordance", () => {
  const css = readFileSync(resolve("frontend/src/styles/refinement.css"), "utf8");
  const dividerRule = css.match(/^\.split-divider\s*\{([^}]+)\}/m)?.[1] || "";

  expect(dividerRule).toContain("cursor: col-resize");
});
test("the titlebar delegates dragging to Electron native hit testing", () => {
  const css = readFileSync(resolve("frontend/src/styles/global.css"), "utf8");
  const dragFillRule = css.match(/^\.titlebar__drag-fill\s*\{([^}]+)\}/m)?.[1] || "";

  expect(dragFillRule).toContain("-webkit-app-region: drag");
  expect(dragFillRule).toContain("cursor: default");
});

test("the Python editor follows light and dark semantic theme tokens", () => {
  const tokens = readFileSync(resolve("frontend/src/styles/tokens.css"), "utf8");
  const workspace = readFileSync(resolve("frontend/src/styles/workspace.css"), "utf8");
  const editorRule = workspace.match(/^\.lab-v2-editor-surface > textarea\s*\{([^}]+)\}/m)?.[1] || "";
  const gutterRule = workspace.match(/^\.lab-v2-editor-surface > pre\s*\{([^}]+)\}/m)?.[1] || "";

  expect(tokens).toMatch(/:root\s*\{[\s\S]*--lab-editor-surface:/);
  expect(tokens).toMatch(/:root\[data-theme="light"\]\s*\{[\s\S]*--lab-editor-surface:/);
  expect(editorRule).toContain("var(--lab-editor-surface)");
  expect(editorRule).toContain("var(--lab-editor-text)");
  expect(gutterRule).toContain("var(--lab-editor-gutter)");
  expect(gutterRule).toContain("var(--lab-editor-muted)");
  expect(workspace).not.toContain("background: #0b1018 !important");
  expect(workspace).not.toContain("background: #080c12 !important");
});

test("custom wallpaper visibility is literal and blur is independent", () => {
  const global = readFileSync(resolve("frontend/src/styles/global.css"), "utf8");
  const workspace = readFileSync(resolve("frontend/src/styles/workspace.css"), "utf8");
  const wallpaperLayer = global.match(/^body::before\s*\{([^}]+)\}/m)?.[1] || "";
  const customWallpaper = workspace.match(/^:root\[data-wallpaper="custom"\] body::before\s*\{([^}]+)\}/m)?.[1] || "";

  expect(wallpaperLayer).toContain("opacity: var(--app-wallpaper-opacity");
  expect(wallpaperLayer).toContain("filter: blur(var(--app-wallpaper-blur");
  expect(customWallpaper).toContain("var(--app-wallpaper-image)");
  expect(customWallpaper).not.toContain("linear-gradient");
});

test("AI replies and learning cards use the same semantic typography ramp", () => {
  const css = readFileSync(resolve("frontend/src/styles/agent.css"), "utf8");
  const agentMessage = css.match(/^\.agent-message\s*\{([^}]+)\}/m)?.[1] || "";
  const learningCopy = css.match(/^\.learning-card p\s*\{([^}]+)\}/m)?.[1] || "";

  expect(agentMessage).toContain("var(--ui-body-font-size)");
  expect(learningCopy).toContain("var(--ui-body-font-size)");

  expect(css).toContain("--ui-small-font-size");
});

test("the learning path preview uses readable semantic typography", () => {
  const css = readFileSync(resolve("frontend/src/styles/agent.css"), "utf8");
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return css.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, "m"))?.[1] || "";
  };

  expect(rule(".learning-card__path > header strong")).toContain("var(--ui-heading-sm-font-size)");
  expect(rule(".learning-card__path > header span")).toContain("var(--ui-small-font-size)");
  expect(rule(".learning-card__path > p")).toContain("var(--ui-body-font-size)");
  expect(rule(".learning-card__path li > i")).toContain("var(--ui-small-font-size)");
  expect(rule(".learning-card__path li > div > strong")).toContain("var(--ui-control-font-size)");
  expect(rule(".learning-card__path li > div > small")).toContain("var(--ui-control-font-size)");
  expect(rule(".learning-card__path li > div > span")).toContain("var(--ui-small-font-size)");

  expect(css).not.toMatch(/\.learning-card__path > strong\s*\{/);
  expect(css).not.toMatch(/\.learning-card__path li > span\s*\{/);
  expect(css).not.toMatch(/\.learning-card__path li b\s*\{/);
  expect(css).not.toMatch(/\.learning-card__path li small\s*\{/);
});

test("liquid glass opacity is tokenized and shared by primary desktop surfaces", () => {
  const tokens = readFileSync(resolve("frontend/src/styles/tokens.css"), "utf8");
  const glass = readFileSync(resolve("frontend/src/styles/glass.css"), "utf8");

  expect(tokens).toContain("--glass-opacity: 78%");
  expect(tokens).toContain("var(--glass-opacity)");
  expect(glass).toContain(".course-home-hero");
  expect(glass).toContain(".learning-center__roadmap");
  expect(glass).toContain(".language-exercise-card");
  expect(glass).toContain(".roadmap-generator");
  expect(glass).toContain(".agent-transcript");
  expect(glass).toContain(".learning-card");
  expect(glass).toContain(".agent-composer");
  expect(glass).toContain(".lab-v2-editor");
  expect(glass).toContain("var(--glass-surface)");
});

test("learning workspace uses lighter nested glass layers instead of stacking the shell opacity", () => {
  const glass = readFileSync(resolve("frontend/src/styles/glass.css"), "utf8");
  const transcriptRule = glass.match(
    /\.desktop-shell \.agent-transcript\s*\{([^}]+)\}/m,
  )?.[1] || "";
  const cardRule = glass.match(
    /\.desktop-shell :is\(\.agent-composer, \.learning-card\)\s*\{([^}]+)\}/m,
  )?.[1] || "";

  expect(glass).toMatch(/--glass-content-surface:[^;]*var\(--glass-surface\)[^;]*transparent/);
  expect(glass).toMatch(/--glass-card-surface:[^;]*var\(--glass-surface\)[^;]*transparent/);
  expect(transcriptRule).toContain("var(--glass-content-surface)");
  expect(transcriptRule).not.toContain("var(--glass-surface)");
  expect(cardRule).toContain("var(--glass-card-surface)");
  expect(cardRule).not.toContain("var(--glass-surface)");
});

test("course library, trash, and knowledge canvas use the shared glass hierarchy", () => {
  const glass = readFileSync(resolve("frontend/src/styles/glass.css"), "utf8");
  const canvasRule = glass.match(
    /\.desktop-shell \.knowledge-canvas\s*\{([^}]+)\}/m,
  )?.[1] || "";

  expect(glass).toContain(".course-library-search");
  expect(glass).toContain(".course-resume");
  expect(glass).toContain(".course-shelf-section");
  expect(glass).toContain(".trash-list article");
  expect(glass).toContain(".knowledge-studio");
  expect(glass).toContain(".canvas-toolbar");
  expect(glass).toContain(".canvas-card");
  expect(canvasRule).toContain("var(--glass-content-surface)");
  expect(canvasRule).toContain("backdrop-filter");
});

test("Python chrome uses the global glass and theme tokens without fixed dark surfaces", () => {
  const tokens = readFileSync(resolve("frontend/src/styles/tokens.css"), "utf8");
  const workspace = readFileSync(resolve("frontend/src/styles/workspace.css"), "utf8");
  const glass = readFileSync(resolve("frontend/src/styles/glass.css"), "utf8");

  expect(tokens).toMatch(/--lab-editor-surface:[^;]*var\(--glass-surface\)/);
  expect(tokens).toMatch(/--lab-chrome-surface:[^;]*var\(--glass-surface\)/);
  expect(workspace.match(/^\.editor-tabs\s*\{([^}]+)\}/m)?.[1] || "")
    .not.toMatch(/#[0-9a-f]{3,8}/i);
  expect(workspace.match(/^\.code-workbench > \.editor-actions\s*\{([^}]+)\}/m)?.[1] || "")
    .not.toMatch(/#[0-9a-f]{3,8}/i);
  expect(glass).toContain(".lab-v2-toolbar");
  expect(glass).toContain(".lab-v2-ide");
  expect(glass).toContain(".lab-v2-panel");
});

test("every desktop surface participates in the four-level font scale", () => {
  const files = [
    "global.css",
    "workspace.css",
    "refinement.css",
    "agent.css",
    "selection-learning.css",
    "settings-center.css",
    "language.css",
    "glass.css",
  ];

  for (const file of files) {
    const css = readFileSync(resolve("frontend/src/styles", file), "utf8");
    expect(css, `${file} contains a fixed font-size`).not.toMatch(/(?:^|[;{]\s*)font-size:\s*[0-9.]+px/m);
    expect(css, `${file} contains a fixed font shorthand`).not.toMatch(/(?:^|[;{]\s*)font:\s*[^;{}]*[0-9.]+px/m);
  }

  const tokens = readFileSync(resolve("frontend/src/styles/tokens.css"), "utf8");
  expect(tokens).toContain("--ui-root-font-size: 16px");
});

test("opening a document has its own visible reader entrance motion", () => {
  const css = readFileSync(resolve("frontend/src/styles/motion.css"), "utf8");
  const openingRule = css.match(/^\.document-workspace--opening\s*\{([^}]+)\}/m)?.[1] || "";

  expect(openingRule).toContain("animation:");
  expect(openingRule).toContain("motion-document-open");
  expect(css).toContain("@keyframes motion-document-open");
  expect(css).toMatch(
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.document-workspace--opening\s*\{[^}]*animation:\s*none[^}]*\}\s*\}/,
  );
  expect(css.indexOf(".document-workspace--opening"))
    .toBeGreaterThan(css.indexOf("100% { transform: none; }"));
});

test("the original PDF reader uses the full document stage instead of a poster-width canvas", () => {
  const css = readFileSync(resolve("frontend/src/styles/workspace.css"), "utf8");
  const rule = css.match(/^\.pdf-original-reader\s*\{([^}]+)\}/m)?.[1] || "";

  expect(rule).toContain("width: calc(100% - 24px)");
  expect(rule).toContain("min-height: calc(100dvh - 154px)");
  expect(rule).not.toContain("1180px");
});

test("the course library uses a compact four-column catalog rather than fixed book covers", () => {
  const css = readFileSync(resolve("frontend/src/styles/refinement.css"), "utf8");

  expect(css).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
  expect(css).toContain("min-height: 214px;");
  expect(css).toContain("width: min(1600px, 100%);");
});
