import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RUNTIME_PROTOCOL_VERSION } from "@trellis/runtime-protocol";
import { writeDesktopBuild } from "../src/desktopBuild/desktopBuild.ts";
import { stagePackages } from "../src/packageClosure/packageClosure.ts";
import { writeBundleManifest } from "../src/resourceBundle/resourceBundle.ts";

const repo = resolve(import.meta.dir, "../../..");
const target = resolve(import.meta.dir, "../dist/host");
await rm(target, { recursive: true, force: true });
await mkdir(join(target, "bin"), { recursive: true });
const copies = await stagePackages(repo, target, [
	"apps/server",
	"packages/api",
	"packages/cli",
	"apps/runtime",
	"packages/runtime-protocol",
]);
await cp(join(repo, "apps/web/dist"), join(target, "apps/web/dist"), { recursive: true });
await cp(process.execPath, join(target, "bin/bun"));
await cp(join(repo, "node_modules/node/bin/node"), join(target, "bin/node"));
await cp(join(repo, "apps/desktop/dist/processor-temperature"), join(target, "bin/processor-temperature"));
await writeFile(
	join(target, "bin/trellis"),
	'#!/bin/sh\nexec "$(dirname "$0")/bun" "$(dirname "$0")/../packages/cli/src/index.ts" "$@"\n',
	{ mode: 0o755 },
);
await writeFile(join(target, "package.json"), JSON.stringify({ private: true, type: "module" }));
await writeFile(
	join(target, "build.json"),
	JSON.stringify(
		{ bun: Bun.version, node: "26.8.2", platform: process.platform, arch: process.arch, packages: copies },
		null,
		2,
	),
);
const desktop = JSON.parse(await readFile(join(repo, "apps/desktop/package.json"), "utf8"));
await writeDesktopBuild(join(repo, "apps/desktop"), target);
await writeBundleManifest(target, desktop.version, RUNTIME_PROTOCOL_VERSION);
console.log(`Staged ${copies} packages at ${target}`);
