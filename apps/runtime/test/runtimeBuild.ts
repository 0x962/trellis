import { resolve } from "node:path";

let build: Promise<void> | undefined;
export function buildRuntime() {
	build ??= Bun.build({
		entrypoints: [resolve(import.meta.dir, "../src/index.ts")],
		outdir: resolve(import.meta.dir, "../dist"),
		target: "node",
		external: ["node-pty", "fs-ext"],
	}).then((result) => {
		if (!result.success) throw new AggregateError(result.logs, "Runtime test build failed");
	});
	return build;
}
