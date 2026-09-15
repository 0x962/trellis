import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const result = await Bun.build({
	entrypoints: [resolve(root, "src/agents/harnesses/codex/bridgeEntry.ts")],
	outdir: resolve(root, "dist"),
	naming: "codex-bridge.js",
	target: "node",
	format: "esm",
	external: ["ws"],
});
if (!result.success) throw new AggregateError(result.logs, "Could not build the Codex bridge.");
