export type FontOption = {
  id: string;
  label: string;
  sample: string;
  stack: string;
  displayStack?: string;
};

export const UI_FONT_OPTIONS: FontOption[] = [
  {
    id: "system",
    label: "系统默认",
    sample: "清晰、均衡，适合长时间使用",
    stack: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif',
    displayStack: '"Segoe UI Variable Display", "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif',
  },
  {
    id: "yahei",
    label: "微软雅黑",
    sample: "熟悉稳重的中文界面字体",
    stack: '"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif',
  },
  {
    id: "song",
    label: "宋体阅读",
    sample: "适合资料阅读与人文课程",
    stack: 'SimSun, "Songti SC", serif',
  },
  {
    id: "kai",
    label: "楷体笔记",
    sample: "更接近纸笔书写的氛围",
    stack: 'KaiTi, "Kaiti SC", serif',
  },
];

export const CODE_FONT_OPTIONS: FontOption[] = [
  {
    id: "system",
    label: "系统等宽",
    sample: "print('StudyPilot')",
    stack: '"Cascadia Mono", "Cascadia Code", Consolas, monospace',
  },
  {
    id: "cascadia",
    label: "Cascadia Code",
    sample: "def learn(topic):",
    stack: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
  },
  {
    id: "consolas",
    label: "Consolas",
    sample: "result = model.fit(X)",
    stack: 'Consolas, "Courier New", monospace',
  },
];

function optionById(options: FontOption[], id: unknown): FontOption {
  return options.find((option) => option.id === id) || options[0];
}

export function applyTypography(uiFont: unknown, codeFont: unknown) {
  const ui = optionById(UI_FONT_OPTIONS, uiFont);
  const code = optionById(CODE_FONT_OPTIONS, codeFont);
  const root = document.documentElement;
  root.style.setProperty("--ui-font-family", ui.stack);
  root.style.setProperty("--display-font-family", ui.displayStack || ui.stack);
  root.style.setProperty("--code-font-family", code.stack);
  root.dataset.uiFont = ui.id;
  root.dataset.codeFont = code.id;
}
