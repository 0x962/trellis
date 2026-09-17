import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
for (const [entry, name, label] of [
	["src/agents/harnesses/codex/bridgeEntry.ts", "codex-bridge.js", "Codex"],
	["src/agents/harnesses/muse/bridgeEntry.ts", "muse-bridge.js", "Muse"],
] as const) {
	const result = await Bun.build({
		entrypoints: [resolve(root, entry)],
		outdir: resolve(root, "dist"),
		naming: name,
		target: "node",
		format: "esm",
		external: ["ws"],
	});
	if (!result.success) throw new AggregateError(result.logs, `Could not build the ${label} bridge.`);
}
