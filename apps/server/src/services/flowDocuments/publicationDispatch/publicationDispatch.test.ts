import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { protocolDigest } from "../../../langflowContracts";
import { documentBytes } from "../documentBytes";
import { publicationArchiveFixture } from "../fixture.publicationArchive";
import type { PublicationProof } from "../publicationProof";
import { retainedPublication } from "../readExecutionPublication/fixture";
import type { PublicationBinding } from "./publicationDispatch";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});
const fixture = () => {
	const root = mkdtempSync(join(tmpdir(), "trellis-publication-archive-"));
	roots.push(root);
	const control = publicationArchiveFixture(root);
	const { snapshot, publication } = retainedPublication();
	const content = {
		engine: snapshot.engine,
		schemaVersion: snapshot.schemaVersion,
		graphDocument: snapshot.graphDocument,
		componentManifestHash: snapshot.componentManifestHash,
	};
	const sourceBytes = documentBytes(content).toString("base64");
	const requestBytes = documentBytes({
		snapshot,
		sourceBytes,
		enginePackageDigest: publication.enginePackageDigest,
	}).toString("utf8");
	const digest = protocolDigest(requestBytes);
	const binding: PublicationBinding = {
		effectId: `publication:${snapshot.flow.id}:${snapshot.revision}`,
		kind: "publication",
		executionId: null,
		attemptId: null,
		jobId: null,
		requestId: digest,
		payloadDigest: digest,
	};
	const created: PublicationProof = {
		requestBytes,
		responseBytes: JSON.stringify(publication, null, 2),
		responseKind: "created",
	};
	const recovered: PublicationProof = {
		requestBytes,
		responseKind: "recovered",
		responseBytes: JSON.stringify({ publication, requestDigest: digest, snapshot, sourceBytes }, null, 3),
	};
	return { ...control, binding, publication, created, recovered };
};
const forbidden = async () => {
	throw new Error("unexpected_effect");
};

test("archives exact authenticated proof and settles the archive terminal ID", async () => {
	const f = fixture();
	expect(await f.dispatch.run(f.binding, { write: async () => f.created, read: forbidden })).toEqual(f.publication);
	const entry = f.gate.read().permits[0]!;
	expect(entry.terminal!.id).not.toBe(f.publication.publicationId);
	const record = JSON.parse(f.archive.readRecordBytes(entry.terminal!.id));
	expect(JSON.parse(record.source.sourceBytes)).toEqual(f.created);
	expect(await f.archive.readTerminal(entry.permit, entry.terminal!.id)).toEqual(entry.terminal!);
	expect(await f.dispatch.run(f.binding, { write: forbidden, read: forbidden })).toEqual(f.publication);
});

test("lost response recovery reads only and settles while dispatch stays closed", async () => {
	const f = fixture();
	let writes = 0;
	const actions = {
		write: async () => {
			writes++;
			throw new Error("response_lost");
		},
		read: async () => f.recovered,
	};
	await expect(f.dispatch.run(f.binding, actions)).rejects.toThrow("response_lost");
	f.gate.closeDispatch({ requestId: crypto.randomUUID(), reason: { kind: "initialize" } });
	expect(await f.dispatch.recover(f.binding, actions)).toEqual(f.publication);
	expect(writes).toBe(1);
	expect(f.gate.read().block).not.toBeNull();
	const entry = f.gate.read().permits[0]!;
	expect(JSON.parse(JSON.parse(f.archive.readRecordBytes(entry.terminal!.id)).source.sourceBytes)).toEqual(f.recovered);
});

test("unknown and absent receipts never acquire, archive, or settle during recovery", async () => {
	const f = fixture();
	const actions = { write: forbidden, read: async () => null };
	expect(await f.dispatch.recover(f.binding, actions)).toBeNull();
	expect(f.gate.read().permits).toHaveLength(0);
	f.gate.acquire(f.binding);
	expect(await f.dispatch.recover(f.binding, actions)).toBeNull();
	expect(f.gate.read().permits[0]!.terminal).toBeNull();
	await expect(f.dispatch.run(f.binding, actions)).rejects.toThrow("publication_outcome_unknown");
});

test.each(["documentHash", "enginePackageDigest", "componentManifestHash"] as const)(
	"conflicting %s leaves the permit unresolved",
	async (field) => {
		const f = fixture();
		const proof = { ...f.created, responseBytes: JSON.stringify({ ...f.publication, [field]: "f".repeat(64) }) };
		await expect(f.dispatch.run(f.binding, { write: async () => proof, read: forbidden })).rejects.toThrow(
			"publication_receipt_identity_mismatch",
		);
		expect(f.gate.read().permits[0]!.terminal).toBeNull();
	},
);

test("changed request bytes cannot settle an existing permit", async () => {
	const f = fixture();
	const proof = { ...f.created, requestBytes: `${f.created.requestBytes} ` };
	await expect(f.dispatch.run(f.binding, { write: async () => proof, read: forbidden })).rejects.toThrow(
		"publication_proof_binding_conflict",
	);
	expect(f.gate.read().permits[0]!.terminal).toBeNull();
});
