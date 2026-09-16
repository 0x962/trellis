import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeBundleManifest } from "../../../../src/resourceBundle/resourceBundle.ts";
import { restartHost } from "../../../../src/restartHost/index.ts";

test("the packaged Restart action uses the durable release restart path", async () => {
	const release = { root: "/release", manifest: { id: "a".repeat(64), protocol: 7, version: "0.0.0" } };
	const host = { pid: 123, origin: "http://127.0.0.1:4521", token: "token" };
	const activations: unknown[][] = [];
	const stages: string[] = [];
	expect(
		await restartHost(
			{
				mode: "packaged",
				home: "/home",
				resources: "/resources",
				userData: "/user-data",
				helper: "/helper",
			},
			async (stage) => {
				stages.push(stage);
			},
			{
				pinResources: async () => release,
				activateHostRelease: async (...args: unknown[]) => {
					activations.push(args);
					await (args[4] as (stage: string) => Promise<void>)("Run durable restart");
					return host;
				},
			},
		),
	).toEqual(host);
	expect(stages).toEqual(["Check installed app", "Run durable restart"]);
	expect(activations).toEqual([["/home", "/helper", release, {}, expect.any(Function), "restart"]]);
});

for (const unknown of [false, true]) {
	test(`${unknown ? "unknown" : "incompatible"} runtime ownership blocks restart before service commands`, async () => {
		const directory = await mkdtemp("/tmp/trl-restart-blocked-");
		const home = join(directory, "host");
		const resources = join(directory, "resources");
		try {
			await mkdir(resources);
			await writeBundleManifest(resources, "next", 7);
			await mkdir(join(home, "runtime"), { recursive: true });
			if (unknown) await writeFile(join(home, "runtime/runtime.sock"), "");
			else await writeFile(join(home, "runtime/manifest.json"), JSON.stringify({ pid: process.pid, version: 6 }));
			await expect(
				restartHost({
					mode: "packaged",
					home,
					resources,
					userData: directory,
					helper: "/missing-helper",
				}),
			).rejects.toThrow(unknown ? "unknown" : "protocol 6");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
}
