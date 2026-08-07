export type ProviderBrandIconName =
  | "openai"
  | "deepseek"
  | "anthropic"
  | "gemini"
  | "azure"
  | "qwen"
  | "kimi"
  | "glm"
  | "openrouter"
  | "siliconflow"
  | "ollama"
  | "lmstudio"
  | "custom";

export const PROVIDER_BRAND_ICONS: Array<{
  name: ProviderBrandIconName;
  label: string;
}> = [
  { name: "openai", label: "OpenAI" },
  { name: "deepseek", label: "DeepSeek" },
  { name: "anthropic", label: "Anthropic" },
  { name: "gemini", label: "Gemini" },
  { name: "azure", label: "Azure" },
  { name: "qwen", label: "通义千问" },
  { name: "kimi", label: "Kimi" },
  { name: "glm", label: "智谱 GLM" },
  { name: "openrouter", label: "OpenRouter" },
  { name: "siliconflow", label: "SiliconFlow" },
  { name: "ollama", label: "Ollama" },
  { name: "lmstudio", label: "LM Studio" },
  { name: "custom", label: "自定义" },
];

const monograms: Partial<Record<ProviderBrandIconName, string>> = {
  anthropic: "A",
  qwen: "Q",
  kimi: "K",
  glm: "G",
  siliconflow: "S",
  ollama: "O",
  lmstudio: "LM",
};

export function ProviderBrandIcon({
  name,
  className = "provider-brand-icon",
}: {
  name: ProviderBrandIconName;
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return <svg className={className} data-brand={name} viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {name === "openai" && <><circle cx="12" cy="12" r="3.2" /><path d="M12 3.4a4.3 4.3 0 0 1 4 2.5 4.3 4.3 0 0 1 3.9 6.5 4.3 4.3 0 0 1-3.9 6.5 4.3 4.3 0 0 1-8 0 4.3 4.3 0 0 1-3.9-6.5A4.3 4.3 0 0 1 8 5.9 4.3 4.3 0 0 1 12 3.4Z" /></>}
    {name === "deepseek" && <><path d="M3.5 14.5c4-5 7.2-6.4 12.2-4.2 1.8.8 3.2.6 4.8-.4-1 4.7-4.7 8-9.8 8-3 0-5.4-1.2-7.2-3.4Z" /><circle cx="14.6" cy="12.3" r=".8" fill="currentColor" stroke="none" /></>}
    {name === "gemini" && <path d="M12 3c.8 5.2 3.8 8.2 9 9-5.2.8-8.2 3.8-9 9-.8-5.2-3.8-8.2-9-9 5.2-.8 8.2-3.8 9-9Z" />}
    {name === "azure" && <><path d="m6 4 6 8-4 8H3l4-8-1-8Z" /><path d="m13 8 8 12h-8l-3-5 3-7Z" /></>}
    {name === "openrouter" && <><path d="M3 8h13l-3-3m3 3-3 3M21 16H8l3-3m-3 3 3 3" /></>}
    {name === "custom" && <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></>}
    {monograms[name] && <text x="12" y="15.3" textAnchor="middle" fill="currentColor" stroke="none" fontSize={name === "lmstudio" ? 7 : 10} fontWeight="750">{monograms[name]}</text>}
  </svg>;
}
