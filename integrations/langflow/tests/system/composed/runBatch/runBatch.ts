import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { BatchInputSchema } from "../batchInput";
import { httpClient } from "../httpClient";
import { preflight } from "../preflight";
import { readPrivateFile } from "../readPrivateFile";
import { runScenario } from "../runScenario";

export async function runBatch(inputFile: string, outputDirectory: string) {
	assert.ok(isAbsolute(inputFile) && isAbsolute(outputDirectory), "absolute_paths_required");
	const inputBytes = await readPrivateFile(inputFile);
	const input = BatchInputSchema.parse(JSON.parse(inputBytes.toString("utf8")));
	const revision = Bun.spawnSync(["git", "-C", import.meta.dir, "rev-parse", "HEAD"]);
	assert.equal(revision.exitCode, 0, "source_revision_unavailable");
	assert.equal(revision.stdout.toString().trim(), input.sourceRevision, "source_revision_mismatch");
	const status = Bun.spawnSync(["git", "-C", import.meta.dir, "status", "--porcelain"]);
	assert.equal(status.exitCode, 0, "source_status_unavailable");
	assert.equal(status.stdout.toString(), "", "source_workspace_not_clean");
	const { qualified, token } = await preflight(input);
	await mkdir(outputDirectory, { mode: 0o700 });
	const write = (name: string, data: unknown) => writeFile(
		join(outputDirectory, name), JSON.stringify(data, null, 2), { mode: 0o600, flag: "wx" },
	);
	await write("batch.json", {
		sourceRevision: input.sourceRevision,
		inputSha256: createHash("sha256").update(inputBytes).digest("hex"),
		packageId: qualified.candidate.enginePackageDigest,
		qualificationSha256: qualified.qualificationSha256,
		imageConfigDigest: qualified.candidate.engine.imageConfigDigest,
		prerequisites: input.prerequisites,
		startedAt: new Date().toISOString(),
		cleanup: "required_from_boot_owner",
		scope: "registered_http_start_to_result",
	});
	for (const scenario of input.scenarios) {
		const directory = join(outputDirectory, scenario.name);
		await mkdir(directory, { mode: 0o700 });
		const result = await runScenario(input, scenario, qualified, httpClient(input, token, directory));
		await write(`${scenario.name}.json`, result);
	}
	await write("http-assertions.json", {
		result: "passed",
		finishedAt: new Date().toISOString(),
		cleanup: "unverified",
		engineeringAcceptance: "unverified",
		browserAcceptance: "unverified",
		installedAcceptance: "unverified",
	});
}
