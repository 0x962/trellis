import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { HOST_RELEASE_SUPPORT, type HostReleaseTarget } from "@trellis/api";
import { RUNTIME_PROTOCOL_VERSION } from "@trellis/runtime-protocol";
import { buildHostRelease } from "./buildHostRelease/index.ts";

const { values } = parseArgs({
	options: {
		output: { type: "string" },
		version: { type: "string" },
		"source-commit": { type: "string" },
		"api-version": { type: "string", default: "1" },
		"database-version": { type: "string" },
	},
});
for (const name of ["output", "version", "source-commit", "database-version"] as const)
	if (!values[name]) throw new Error(`--${name} is required`);
if (process.platform !== "darwin" && process.platform !== "linux")
	throw new Error(`The host release does not support ${process.platform}.`);
if (process.arch !== "x64" && process.arch !== "arm64")
	throw new Error(`The host release does not support ${process.arch}.`);

const repositoryRoot = resolve(import.meta.dir, "../..");
const nodePackage = JSON.parse(await readFile(join(repositoryRoot, "node_modules/node/package.json"), "utf8")) as {
	version: string;
};
const nodeExecutable = join(repositoryRoot, "node_modules/node/bin/node");
const nodeAbiProcess = Bun.spawn([nodeExecutable, "-p", "process.versions.modules"], {
	stdin: "ignore",
	stdout: "pipe",
	stderr: "inherit",
});
const nodeAbi = (await new Response(nodeAbiProcess.stdout).text()).trim();
if ((await nodeAbiProcess.exited) !== 0 || nodeAbi === "") throw new Error("The pinned Node runtime did not report its ABI.");
const arch = process.arch;
const target: HostReleaseTarget =
	process.platform === "linux"
		? {
				platform: "linux",
				arch,
				libc: { family: "glibc", version: HOST_RELEASE_SUPPORT.linux.libc.minVersion },
			}
		: { platform: "darwin", arch, libc: null };
const manifest = await buildHostRelease({
	repositoryRoot,
	outputRoot: resolve(values.output!),
	version: values.version!,
	sourceCommit: values["source-commit"]!,
	target,
	compatibility: {
		api: { min: values["api-version"]!, max: values["api-version"]! },
		runtime: { protocol: RUNTIME_PROTOCOL_VERSION },
		database: { min: values["database-version"]!, max: values["database-version"]! },
	},
	bun: { executable: process.execPath, version: Bun.version },
	node: {
		executable: nodeExecutable,
		version: nodePackage.version,
		abi: nodeAbi,
	},
});
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
