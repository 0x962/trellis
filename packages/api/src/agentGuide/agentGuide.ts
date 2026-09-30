/// <reference path="./text.d.ts" />
import template from "./template.md" with { type: "text" };

export const defaultAgentPrompt = template;

export const contextKeys = [...new Set([...template.matchAll(/\{\{([a-z_.]+)\}\}/g)].map((match) => match[1]!))];

export const agentGuide = (context: Record<string, string> = {}, prompt = defaultAgentPrompt) =>
	prompt.replace(/\{\{([a-z_.]+)\}\}/g, (_match, key: string) => context[key] ?? "Not recorded");
