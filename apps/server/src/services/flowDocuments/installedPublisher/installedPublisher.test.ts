import { afterEach, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CandidatePackage } from "../../../../../../integrations/langflow/release/loadCandidatePackage/loadCandidatePackage.ts";
import type { LiveOwnership } from "../../../langflowHost/contracts";
import { documentBytes } from "../documentBytes";
import { flowId, manifestHash, packageDigest } from "../fixture";
import { type PublicationPermit, publicationDispatch } from "../publicationDispatch";
import type { SavedDocument } from "../publisher";
import { installedPublisher } from "./installedPublisher.ts";

let directory: string;
let fetchSpy: ReturnType<typeof spyOn> | undefined;
afterEach(async () => {
	fetchSpy?.mockRestore();
	if (directory) await rm(directory, { recursive: true });
});

test("the concrete producer binds authenticated bytes, receipt identity, and lost-response recovery", async () => {
	directory = await mkdtemp(join(tmpdir(), "trellis-publication-client-"));
	const authenticationFile = join(directory, "token");
	await writeFile(authenticationFile, "secret", { mode: 0o600 });
	const source = {
		schemaVersion: 1 as const,
		engine: "langflow" as const,
		graphDocument: { nodes: [], edges: [] },
		componentManifestHash: manifestHash,
	};
	const sourceBytes = documentBytes(source);
	const snapshot: SavedDocument["snapshot"] = {
		...source,
		flow: {
			id: flowId,
			project: null,
			slug: "review",
			version: 2,
			name: "Review",
			description: "Review a proposed change.",
			briefing: "Read the ticket.",
			harness: null,
			createdAt: "2026-09-29T06:00:00.000Z",
			updatedAt: "2026-09-29T08:00:00.000Z",
		},
		revision: 2,
		documentHash: createHash("sha256").update(sourceBytes).digest("hex"),
		diagnostics: [],
	};
	const receipt = {
		publicationId: "00000000000000000000000002",
		flowId,
		revision: 2,
		documentHash: snapshot.documentHash,
		engineFlowId: "immutable-flow",
		enginePackageDigest: packageDigest,
		componentManifestHash: manifestHash,
		publishedAt: "2026-09-29T08:01:00.000Z",
		conversion: null,
	};
	let permit: PublicationPermit | null = null;
	let requestDigest = "";
	let posts = 0;
	const fakeFetch: typeof fetch = Object.assign(
		async (url: RequestInfo | URL, init?: RequestInit) => {
			expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
			expect(init?.redirect).toBe("error");
			if (String(url).endsWith("/validate")) return Response.json({ diagnostics: [] });
			if (init?.method === "GET") return Response.json({ publication: receipt, requestDigest });
			posts++;
			const bytes = String(init?.body);
			requestDigest = createHash("sha256").update(bytes).digest("hex");
			expect(JSON.parse(bytes).sourceBytes).toBe(sourceBytes.toString("base64"));
			throw new Error("response_lost");
		},
		{ preconnect: () => {} },
	);
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(fakeFetch);
	const dispatch = publicationDispatch({
		recoverPermit: () => (permit ? { permit, terminal: null } : null),
		acquire: (binding) => (permit = { id: "permit", dataHomeId: "home", generation: 1, binding }),
		settle: async (saved, id) => {
			expect((await client.readTerminal(saved, id)).outcome).toBe("completed");
		},
	});
	const client = installedPublisher({
		package: { enginePackageDigest: packageDigest, componentManifestHash: manifestHash } as CandidatePackage,
		ownership: { endpoint: "http://127.0.0.1:7860", identity: { manifestDigest: packageDigest } } as LiveOwnership,
		authenticationFile,
		dispatch,
	});
	expect(await client.validate({ snapshot, sourceBytes })).toEqual([]);
	await expect(client.publish({ snapshot, sourceBytes })).rejects.toThrow("response_lost");
	expect(await client.publish({ snapshot, sourceBytes })).toEqual(receipt);
	expect(posts).toBe(1);
	await expect(client.publish({ snapshot: { ...snapshot, revision: 3 }, sourceBytes })).rejects.toThrow(
		"publication_permit_conflict",
	);
});
