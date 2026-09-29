import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapFixture } from "../fixtures";
import { readEngineConfiguration } from "./engineConfiguration";

test("engine configuration preserves original bytes and binds the sealed container paths", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-engine-configuration-"));
	try {
		const f = bootstrapFixture();
		const configuration = {
			version: 1,
			enginePackageDigest: f.candidate.enginePackageDigest,
			componentManifestHash: f.candidate.componentManifestHash,
			engineCommit: f.manifest.source.commit,
			catalogPath: `/opt/trellis/inputs/${f.manifest.components.catalog.path}`,
			trellisRoot: "/opt/trellis/inputs/catalog/trellis",
			engineRoot: "/opt/trellis/inputs/catalog/engine",
			userId: "00000000-0000-4000-8000-000000000010",
			exportRoot: "/data/exports",
			nativeReservationOrigin: "http://trellis.internal:4521",
			nativeReservationAuthenticationFile: "/run/trellis-secrets/native-reservations.token",
		};
		const path = join(directory, "engine.json");
		const original = Buffer.from(`${JSON.stringify(configuration, null, 2)}\n`);
		await writeFile(path, original, { mode: 0o600 });
		const result = await readEngineConfiguration(path, f);
		expect(result.sourceBytes).toEqual(original);
		expect(result.sha256).toBe(createHash("sha256").update(original).digest("hex"));
		expect(await readFile(path)).toEqual(original);
		for (const changed of [
			{ enginePackageDigest: "b".repeat(64) },
			{ componentManifestHash: "b".repeat(64) },
			{ engineCommit: "b".repeat(40) },
			{ catalogPath: f.candidate.componentManifestPath },
			{ trellisRoot: "/host/checkout" },
			{ engineRoot: "/host/engine" },
			{ nativeReservationAuthenticationFile: "/host/native.token" },
		]) {
			await writeFile(path, JSON.stringify({ ...configuration, ...changed }));
			await expect(readEngineConfiguration(path, f)).rejects.toThrow("langflow_engine_configuration_conflict");
		}
		await writeFile(path, JSON.stringify({ ...configuration, unexpected: true }));
		await expect(readEngineConfiguration(path, f)).rejects.toThrow();
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
