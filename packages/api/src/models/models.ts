import { z } from "zod";
import catalog from "./catalog.json";

type Harness = "claude" | "codex" | "pi" | "opencode" | "muse" | "custom";
const claudeNames: Record<string, string> = {
	"anthropic/claude-3-haiku": "claude-3-haiku-20240307",
	"anthropic/claude-fable-5": "claude-fable-5",
	"anthropic/claude-fable-5.1": "claude-fable-5-1",
	"anthropic/claude-opus-4.6": "claude-opus-4-6",
	"anthropic/claude-opus-4.7": "claude-opus-4-7",
	"anthropic/claude-opus-4.8": "claude-opus-4-8",
	"anthropic/claude-opus-5": "claude-opus-5",
	"anthropic/claude-sonnet-4.6": "claude-sonnet-4-6",
	"anthropic/claude-sonnet-5": "claude-sonnet-5",
	"anthropic/claude-haiku-4.5": "claude-haiku-4-5-20251001",
	"anthropic/claude-opus-4": "claude-opus-4-20250514",
	"anthropic/claude-opus-4.5": "claude-opus-4-5-20251101",
	"anthropic/claude-sonnet-4": "claude-sonnet-4-20250514",
	"anthropic/claude-sonnet-4.5": "claude-sonnet-4-5-20250929",
};
const aliases: Record<string, string> = {
	sonnet: "anthropic/claude-sonnet-5",
	opus: "anthropic/claude-opus-5",
	haiku: "anthropic/claude-haiku-4.5",
	fable: "anthropic/claude-fable-5.1",
	best: "anthropic/claude-fable-5.1",
};
const nativeClaude = (id: string) => claudeNames[id]!;
const nativeCodex = (id: string) =>
	id.startsWith("openai/") &&
	!id.endsWith("-fast") &&
	/^(gpt-5(?:\.[123])?-codex(?:-(?:max|mini))?|gpt-5\.[456](?:-(?:sol|terra|luna|mini|nano))?|gpt-6-astra)$/.test(
		id.slice(7),
	);
// Muse Code serves the Muse Spark models of its Meta account under their
// bare names, such as `muse-spark-1.3`. The canonical id carries the
// `meta/` vendor prefix.
const nativeMuse = (id: string) => id.startsWith("meta/muse-spark-");

export const MODEL_CATALOG = catalog;
export const ModelIdSchema = z
	.string()
	.trim()
	.refine(
		(id) => catalog.some((model) => model.id === id),
		"Select a canonical model ID from models.list (trellis models list).",
	);
export const modelsForHarness = (harness?: Harness) =>
	catalog.filter(
		({ id }) =>
			harness === undefined ||
			harness === "pi" ||
			harness === "opencode" ||
			(harness === "claude" && id in claudeNames) ||
			(harness === "codex" && nativeCodex(id)) ||
			(harness === "muse" && nativeMuse(id)),
	);
export const supportsModel = (harness: Harness, id: string) =>
	modelsForHarness(harness).some((model) => model.id === id);
export function toHarnessModel(harness: Exclude<Harness, "custom">, id: string): string {
	if (!supportsModel(harness, id))
		throw new Error(`Model ${id} is not supported by ${harness}. Select a model from models.list.`);
	if (harness === "claude") return nativeClaude(id);
	if (harness === "codex") return id.slice("openai/".length);
	if (harness === "muse") return id.slice("meta/".length);
	return `${harness === "pi" ? "vercel-ai-gateway" : "vercel"}/${id}`;
}
export function fromHarnessModel(harness: Exclude<Harness, "custom">, name: string): string {
	const id = name.replace(/^(vercel|vercel-ai-gateway)\//, "");
	const native = id.replace(/^anthropic\//, "");
	const claude = catalog.find(
		(model) =>
			model.id in claudeNames &&
			[nativeClaude(model.id), nativeClaude(model.id).replace(/-\d{8}$/, "")].includes(native),
	);
	if (claude) return claude.id;
	if (/^(google|anthropic|meta|openai)\//.test(id)) return id;
	if (harness === "claude")
		return aliases[id] ?? `anthropic/${id.replace(/-(\d+)-(\d+)(?=-|$)/, "-$1.$2").replace(/-\d{8}$/, "")}`;
	if (harness === "codex") return `openai/${id}`;
	if (harness === "muse") return `meta/${id}`;
	if (id.includes("/")) return id;
	const model = catalog.find((model) => model.id.slice(model.id.indexOf("/") + 1) === id);
	if (!model) throw new Error(`Unrecognized ${harness} model: ${name}`);
	return model.id;
}
