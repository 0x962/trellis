import { afterEach, expect, test } from "bun:test";
import { readDocumentAction } from "../../../db/queries/langflowDocuments";
import { documentBytes } from "../documentBytes";
import { saveInput } from "../fixture";
import { get } from "../get";
import { save } from "../save";
import { publicationFixture } from "./fixture";
import { publishSavedDocument } from "./publishSavedDocument";

let f: Awaited<ReturnType<typeof publicationFixture>>;
afterEach(async () => { await f?.db.$client.close(); });

test("retains the exact publication response before current producer access", async () => {
	f = await publicationFixture();
	const first = await publishSavedDocument(f.io, f.input, f.services);
	expect(first).toMatchObject({ requestId: f.input.requestId, document: { publication: { state: "published" } } });
	const row = await f.run((tx) => readDocumentAction(tx, f.input));
	expect(row!.requestBytes).toEqual(documentBytes(f.input).toString("utf8"));
	const unavailable = () => { throw new Error("unavailable"); };
	expect(await publishSavedDocument(f.io, f.input, { ...f.services, publisher: unavailable, installedIdentity: unavailable })).toEqual(first);
	await expect(publishSavedDocument(f.io, { ...f.input, enginePackageDigest: "f".repeat(64) }, f.services))
		.rejects.toMatchObject({ code: "FLOW_REQUEST_CONFLICT" });
});

test("an unknown response retains its claim and uses recovery without another publish", async () => {
	f = await publicationFixture();
	let writes = 0;
	let reads = 0;
	const engine = {
		...f.engine,
		publish: async () => { writes++; throw new Error("response_lost"); },
		recover: async (document: Parameters<typeof f.engine.publish>[0]) => { reads++; return f.engine.publish(document); },
	};
	const services = { ...f.services, publisher: async () => engine };
	expect(await publishSavedDocument(f.io, f.input, services)).toEqual({ state: "pending", requestId: f.input.requestId });
	expect((await f.run((tx) => readDocumentAction(tx, f.input)))!.document).toBeNull();
	expect(await publishSavedDocument(f.io, f.input, services)).toMatchObject({ document: { publication: { state: "published" } } });
	expect(writes).toBe(1);
	expect(reads).toBe(1);
});

test("an unknown recovered receipt remains pending without another effect", async () => {
	f = await publicationFixture();
	let writes = 0;
	const services = {
		...f.services,
		publisher: async () => ({ ...f.engine, publish: async () => { writes++; throw new Error("unknown"); }, recover: async () => null }),
	};
	await publishSavedDocument(f.io, f.input, services);
	expect(await publishSavedDocument(f.io, f.input, services)).toEqual({ state: "pending", requestId: f.input.requestId });
	expect(writes).toBe(1);
});

test("a stale first request creates no claim", async () => {
	f = await publicationFixture();
	await f.run((tx) => save(f.ctx, tx, saveInput()));
	await expect(publishSavedDocument(f.io, f.input, f.services)).rejects.toMatchObject({ code: "FLOW_VERSION_CONFLICT" });
	expect(await f.run((tx) => readDocumentAction(tx, f.input))).toBeNull();
});

test("a late publication confirms only its captured revision", async () => {
	f = await publicationFixture();
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const first = publishSavedDocument(f.io, f.input, {
		...f.services,
		publisher: async () => ({ ...f.engine, publish: async (document) => { entered.resolve(); await release.promise; return f.engine.publish(document); } }),
	});
	await entered.promise;
	await f.run((tx) => save(f.ctx, tx, saveInput()));
	release.resolve();
	expect(await first).toMatchObject({ document: { revision: 1, publication: { state: "published" } } });
	expect(await f.run((tx) => get(f.ctx, tx, { flow: f.input.flowId }))).toMatchObject({ revision: 2, publication: { state: "pending" } });
});
