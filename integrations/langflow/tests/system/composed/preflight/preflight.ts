import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { loadQualifiedPackage } from "../../../../release";
import type { BatchInput } from "../batchInput";
import { readPrivateFile } from "../readPrivateFile";

export async function preflight(input: BatchInput) {
	assert.ok(Date.parse(input.deadlineAt) > Date.now(), "batch_deadline_elapsed");
	assert.equal(new Set(input.scenarios.map((row) => row.name)).size, input.scenarios.length);
	assert.equal(new Set(input.scenarios.map((row) => row.start.requestId)).size, input.scenarios.length);
	for (const scenario of input.scenarios) {
		assert.ok(!["batch", "http-assertions"].includes(scenario.name), "reserved_scenario_name");
		for (const rows of [scenario.decisions, scenario.expectedOccurrences]) {
			assert.equal(new Set(rows.map((row) => JSON.stringify(row.visit))).size, rows.length, "duplicate_visit");
		}
	}
	const configurationBytes = await readPrivateFile(input.prerequisites.bootstrapConfiguration.path);
	for (const [name, reference] of Object.entries(input.prerequisites)) {
		const bytes = name === "bootstrapConfiguration"
			? configurationBytes
			: await readFile(reference.path);
		assert.equal(createHash("sha256").update(bytes).digest("hex"), reference.sha256, `${name}_changed`);
	}
	const configuration = z.object({
		packageRoot: z.string(),
		packageId: z.string(),
		qualificationFile: z.string(),
		qualificationSha256: z.string(),
		expectedDataHomeId: z.string(),
		runtime: z.unknown(),
	}).parse(JSON.parse(configurationBytes.toString("utf8")));
	const { expectedDataHomeId, ...identity } = configuration;
	const { dataHomeId, ...qualifiedIdentity } = input.qualification;
	assert.equal(expectedDataHomeId, dataHomeId, "bootstrap_data_home_mismatch");
	assert.deepEqual(identity, qualifiedIdentity, "bootstrap_package_identity_mismatch");
	const qualified = await loadQualifiedPackage(input.qualification);
	const token = (await readPrivateFile(input.authenticationFile)).toString("utf8").trim();
	assert.ok(token.length > 0 && !/[\r\n]/.test(token), "invalid_authentication_file");
	return { qualified, token };
}
