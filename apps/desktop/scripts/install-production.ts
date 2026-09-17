import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { installApplication } from "../src/installApplication/installApplication.ts";
import { withInstallationLock } from "../src/installationLock/installationLock.ts";
import { assertInstalledAncestry } from "../src/installedAncestry/installedAncestry.ts";
import { assertProductionSource } from "../src/productionSource/productionSource.ts";
import { readBundleManifest, writeBundleManifest } from "../src/resourceBundle/resourceBundle.ts";

const { values } = parseArgs({ options: { prepare: { type: "string" } } });
const repo = resolve(import.meta.dir, "../../..");
const execute = promisify(execFile);
const commit = await assertProductionSource(repo, { phase: "build" });
const installed = join(homedir(), "Applications/Trellis.app");
const destination = values.prepare ? resolve(values.prepare) : installed;
const assertAncestry = async () => {
	await assertInstalledAncestry(repo, commit, installed);
	if (destination !== installed) await assertInstalledAncestry(repo, commit, destination);
};
await assertAncestry();
const build = await mkdtemp(join(tmpdir(), "trellis-production-"));
const source = join(build, "source");
const output = join(build, "package");
const cache = join(homedir(), "Library/Caches/Trellis");
const env = {
	...process.env,
	CSC_IDENTITY_AUTO_DISCOVERY: "false",
	electron_config_cache: join(cache, "electron"),
	ELECTRON_BUILDER_CACHE: join(cache, "electron-builder"),
};
console.log(`Build ${commit} in ${build}`);
const run = async (command: string[], cwd = source) => {
	console.log(command.join(" "));
	const child = Bun.spawn(command, { cwd, env, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
	const code = await child.exited;
	if (code !== 0) throw new Error(`${command[0]} exited ${code}. Build files remain at ${build}.`);
};
await mkdir(source);
await run(["/usr/bin/git", "archive", "--format=tar", `--output=${join(build, "source.tar")}`, commit], repo);
await run(["/usr/bin/tar", "-xf", join(build, "source.tar"), "-C", source]);
await run([process.execPath, "install", "--frozen-lockfile"]);
await run(["node", "installArchSpecificPackage.js"], join(source, "node_modules/node"));
const node = join(source, "node_modules/node/bin/node");
await run([node, "install.js"], join(source, "node_modules/electron"));
await run([process.execPath, "run", "build"], join(source, "apps/desktop"));
const resources = join(source, "apps/desktop/dist/host");
const metadata = JSON.parse(await readFile(join(resources, "build.json"), "utf8"));
await writeFile(join(resources, "build.json"), `${JSON.stringify({ ...metadata, commit }, null, 2)}\n`);
const manifest = await readBundleManifest(resources);
await writeBundleManifest(resources, manifest.version, manifest.protocol);
await run(
	[
		node,
		join(source, "node_modules/.bin/electron-builder"),
		"--config",
		"electron-builder.json",
		`--config.directories.output=${output}`,
		`--config.electronDist=${join(source, "node_modules/electron/dist")}`,
		"--mac",
		"--dir",
	],
	join(source, "apps/desktop"),
);
const application = join(output, process.arch === "arm64" ? "mac-arm64" : "mac", "Trellis.app");
await run([process.execPath, "apps/desktop/scripts/sign-preview.ts", application]);
await mkdir(join(homedir(), "Applications"), { recursive: true });
await withInstallationLock(join(homedir(), "Applications/.trellis-install.lock"), async () => {
	await installApplication(application, destination, async (staged) => {
		await execute("/usr/bin/codesign", ["--verify", "--deep", "--strict", staged]);
		await assertProductionSource(repo, { phase: "publish", commit });
		await assertAncestry();
	});
});
await run(["/usr/bin/codesign", "--verify", "--deep", "--strict", destination]);
console.log(
	JSON.stringify(
		{
			application: destination,
			commit,
			release: await readBundleManifest(join(destination, "Contents/Resources/host")),
		},
		null,
		2,
	),
);
console.log("Restart Trellis to activate this package.");
await rm(build, { recursive: true });
