import { afterEach, expect, test } from "bun:test";
import { occurrenceFixture } from "./fixture";
import { resolveNativeOccurrence } from "./resolveNativeOccurrence";

const databases: Awaited<ReturnType<typeof occurrenceFixture>>["db"][] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) await db.$client.close();
});

const muse = {
	preset: "muse",
	model: "meta/muse-spark-1.3",
	startCommand: "muse --yolo {{prompt}}",
	resumeCommand: "muse --yolo resume --last",
};
const custom = {
	preset: "custom",
	startCommand: "fixture-agent {{prompt}}",
	resumeCommand: "fixture-agent resume {{resumeText}}",
};
const codex = {
	preset: "codex",
	model: "openai/gpt-6-astra",
	startCommand: "codex {{prompt}}",
	resumeCommand: "codex resume {{resumeText}}",
};

async function resolve(harness: Record<string, string>) {
	const { db, ctx, visit } = await occurrenceFixture(false, harness);
	databases.push(db);
	return db.transaction((tx) => resolveNativeOccurrence(ctx, tx, { requestBytes: visit.requestBytes, visit }));
}

for (const harness of [muse, custom]) {
	test(`preserves explicit ${harness.preset} policy without unsupported fields`, async () => {
		const approved = await resolve(harness);
		expect(approved.harness).toEqual(harness);
		expect(Object.hasOwn(approved.harness, "effort")).toBe(false);
		if (harness.preset === "custom") expect(Object.hasOwn(approved.harness, "model")).toBe(false);
	});
}

const invalidPolicies: [string, Record<string, string>][] = [
	["missing supported effort", codex],
	["unsupported Muse effort", { ...muse, effort: "high" }],
	["missing Muse model", { preset: muse.preset, startCommand: muse.startCommand, resumeCommand: muse.resumeCommand }],
	["unsupported Muse model", { ...muse, model: "openai/gpt-6-astra" }],
	["custom model", { ...custom, model: "meta/muse-spark-1.3" }],
	["custom effort", { ...custom, effort: "high" }],
	["missing explicit commands", { preset: "muse", model: "meta/muse-spark-1.3" }],
];
for (const [name, harness] of invalidPolicies) {
	test(`rejects ${name} without policy defaults`, async () => {
		await expect(resolve(harness)).rejects.toThrow("native_policy_unresolved");
	});
}
