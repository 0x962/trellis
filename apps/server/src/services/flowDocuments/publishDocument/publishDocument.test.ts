import { afterEach, beforeEach, expect, test } from "bun:test";
import { FlowDocumentV1Schema } from "@trellis/api";
import { flowId, publisher, saveInput, serviceFixture } from "../fixture";
import { get } from "../get";
import { legacyServices } from "../legacyServices";
import { requireCurrentPublication } from "../requireCurrentPublication";
import { save } from "../save";
import { publishDocument } from "./publishDocument.ts";

const { update } = legacyServices;

let h: Awaited<ReturnType<typeof serviceFixture>>;
beforeEach(async () => {
	h = await serviceFixture();
});
afterEach(async () => {
	await h.db.$client.close();
});
const current = () => h.run((tx) => get(h.ctx, tx, { flow: flowId }));
const executable = (expectedVersion: number) =>
	h.run((tx) => requireCurrentPublication(h.ctx, tx, { flow: flowId, expectedVersion }));

test("publication binds the saved revision and installed package before a new start", async () => {
	await h.run((tx) => save(h.ctx, tx, saveInput()));
	await expect(executable(2)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	const receipt = await publishDocument(h.io, { flow: flowId, revision: 2 }, publisher());
	expect(receipt).toEqual((await executable(2)).publication);
	expect(FlowDocumentV1Schema.safeParse(await current()).success).toBe(true);
	await expect(executable(1)).rejects.toMatchObject({ code: "FLOW_VERSION_CONFLICT" });
	await h.run((tx) => update(h.ctx, tx, { flow: flowId, expectedVersion: 2, briefing: "Changed instructions" }));
	await expect(executable(3)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect((await current()).lastExecutablePublication).toEqual(receipt);
});

test("an engine outage retains saved bytes and durable failure diagnostics", async () => {
	const input = saveInput();
	const saved = await h.run((tx) => save(h.ctx, tx, input));
	const engine = publisher({
		validate: async () => {
			throw new Error("private connection detail");
		},
	});
	expect(await publishDocument(h.io, { flow: flowId, revision: 2 }, engine)).toBeNull();
	const document = await current();
	expect(document.graphDocument).toEqual(saved.graphDocument);
	expect(document.documentHash).toBe(saved.documentHash);
	expect(document.publication.state).toBe("failed");
	expect(JSON.stringify(document.publication)).not.toContain("private connection detail");
	expect(h.logs).toEqual([
		{
			message: "flow publication failed",
			fields: {
				flowId,
				revision: 2,
				requestId: "test",
				stage: "validate",
				category: "engine_error",
			},
		},
	]);
	await expect(executable(2)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect(await h.run((tx) => save(h.ctx, tx, input))).toEqual(saved);
});

test("component manifest mismatch refuses publication before an engine call", async () => {
	await h.run((tx) => save(h.ctx, tx, saveInput()));
	let calls = 0;
	const engine = publisher({
		componentManifestHash: "f".repeat(64),
		validate: async () => {
			calls++;
			return [];
		},
	});
	expect(await publishDocument(h.io, { flow: flowId, revision: 2 }, engine)).toBeNull();
	expect(calls).toBe(0);
	expect((await current()).publication.state).toBe("blocked");
});

test("engine validation rejects substituted code and prevents the publish call", async () => {
	await h.run((tx) => save(h.ctx, tx, saveInput()));
	let published = false;
	const engine = publisher({
		validate: async () => [
			{
				code: "component_code_mismatch",
				message: "The component code differs from the installed package.",
				severity: "error",
				path: ["nodes", 0],
			},
		],
		publish: async (document) => {
			published = true;
			return publisher().publish(document);
		},
	});
	await publishDocument(h.io, { flow: flowId, revision: 2 }, engine);
	expect(published).toBe(false);
	expect((await current()).publication.state).toBe("blocked");
});

test("a receipt for another document or engine package cannot authorize a start", async () => {
	await h.run((tx) => save(h.ctx, tx, saveInput()));
	const engine = publisher({
		publish: async (document) => ({ ...(await publisher().publish(document)), enginePackageDigest: "f".repeat(64) }),
	});
	expect(await publishDocument(h.io, { flow: flowId, revision: 2 }, engine)).toBeNull();
	await expect(executable(2)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect((await current()).lastExecutablePublication).toBeNull();
});

test("a late publication cannot make a newer saved revision executable", async () => {
	await h.run((tx) => save(h.ctx, tx, saveInput()));
	const entered = Promise.withResolvers<void>();
	const finish = Promise.withResolvers<void>();
	const engine = publisher({
		validate: async () => {
			entered.resolve();
			await finish.promise;
			return [];
		},
	});
	const pending = publishDocument(h.io, { flow: flowId, revision: 2 }, engine);
	await entered.promise;
	await h.run((tx) => save(h.ctx, tx, saveInput(2)));
	finish.resolve();
	const old = await pending;
	const document = await current();
	expect(document.revision).toBe(3);
	expect(document.publication.state).toBe("pending");
	expect(document.lastExecutablePublication).toEqual(old);
	await expect(executable(3)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
});

test("a confirmed publication wins over a late engine failure", async () => {
	await h.run((tx) => save(h.ctx, tx, saveInput()));
	const entered = Promise.withResolvers<void>();
	const finish = Promise.withResolvers<void>();
	const failed = publishDocument(
		h.io,
		{ flow: flowId, revision: 2 },
		publisher({
			validate: async () => {
				entered.resolve();
				await finish.promise;
				throw new Error("unavailable");
			},
		}),
	);
	await entered.promise;
	const receipt = await publishDocument(h.io, { flow: flowId, revision: 2 }, publisher());
	finish.resolve();
	await failed;
	expect(receipt).toEqual((await executable(2)).publication);
});

test("an older revision can recover a committed engine receipt without another publication", async () => {
	const saved = await h.run((tx) => save(h.ctx, tx, saveInput()));
	const engine = publisher();
	const { publication: _publication, lastExecutablePublication: _last, ...snapshot } = saved;
	if (snapshot.engine !== "langflow") throw new Error("fixture_engine");
	const receipt = await engine.publish({ snapshot, sourceBytes: Buffer.from("fixture") });
	await h.run((tx) => save(h.ctx, tx, saveInput(2)));
	const forbidden = async () => {
		throw new Error("unexpected_engine_write");
	};
	expect(
		await publishDocument(
			h.io,
			{ flow: flowId, revision: 2 },
			publisher({
				validate: forbidden,
				publish: forbidden,
				recover: async () => receipt,
			}),
		),
	).toEqual(receipt);
	expect((await h.run((tx) => get(h.ctx, tx, { flow: flowId }))).publication.state).toBe("pending");
});
