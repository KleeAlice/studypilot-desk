import {
  PROVIDER_BRAND_ICONS,
  type ProviderBrandIconName,
} from "./ProviderBrandIcon";
import type { AgentProvider } from "./types";


export function providerIconName(
  provider: Pick<AgentProvider, "protocol" | "base_url" | "label" | "icon">,
): ProviderBrandIconName {
  const stored = String(provider.icon || "") as ProviderBrandIconName;
  if (PROVIDER_BRAND_ICONS.some((item) => item.name === stored)) return stored;
  const fingerprint = `${provider.label} ${provider.base_url}`.toLowerCase();
  if (/deepseek/.test(fingerprint)) return "deepseek";
  if (/ollama/.test(fingerprint)) return "ollama";
  if (/lm\s*studio/.test(fingerprint)) return "lmstudio";
  if (provider.protocol === "gemini" || /gemini|google/.test(fingerprint)) return "gemini";
  if (provider.protocol === "anthropic" || /anthropic|claude/.test(fingerprint)) return "anthropic";
  if (provider.protocol === "azure_openai" || /azure/.test(fingerprint)) return "azure";
  if (/qwen|dashscope|通义/.test(fingerprint)) return "qwen";
  if (/moonshot|kimi/.test(fingerprint)) return "kimi";
  if (/glm|bigmodel|智谱/.test(fingerprint)) return "glm";
  if (/openrouter/.test(fingerprint)) return "openrouter";
  if (/silicon/.test(fingerprint)) return "siliconflow";
  if (/openai/.test(fingerprint)) return "openai";
  return "custom";
}

export function createProviderId(now: number = Date.now()) {
  return `custom_${now.toString(36)}`;
}
