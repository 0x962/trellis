import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
await mkdir(resolve(root, "dist"), { recursive: true });
for (const name of ["main", "preload"]) {
	const result = await Bun.build({
		entrypoints: [resolve(root, `src/${name}.ts`)],
		outdir: resolve(root, "dist"),
		naming: `${name}.cjs`,
		target: "node",
		format: "cjs",
		external: ["electron"],
	});
	if (!result.success) throw new AggregateError(result.logs, `Could not build ${name}.`);
}
