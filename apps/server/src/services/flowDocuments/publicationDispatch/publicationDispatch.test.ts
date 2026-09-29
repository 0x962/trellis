import { expect, test } from "bun:test";
import type { FlowPublicationV1 } from "@trellis/api";
import { type PublicationBinding, type PublicationPermit, publicationDispatch } from "./publicationDispatch.ts";

const binding: PublicationBinding = {
	effectId: "publication:flow:2",
	kind: "publication",
	executionId: null,
	attemptId: null,
	jobId: null,
	requestId: "request",
	payloadDigest: "digest",
};
const receipt = { publicationId: "receipt" } as FlowPublicationV1;

test("a lost response uses only a receipt read, including while dispatch is closed", async () => {
	let permit: PublicationPermit | null = null;
	let closed = false;
	let writes = 0;
	let settled = 0;
	const dispatch = publicationDispatch({
		recoverPermit: () => (permit ? { permit, terminal: null } : null),
		acquire: () => {
			if (closed) throw new Error("closed");
			permit = { id: "permit", dataHomeId: "home", generation: 1, binding };
			return permit;
		},
		settle: async (_permit, id) => {
			expect(id).toBe("receipt");
			settled++;
		},
	});
	const actions = {
		write: async () => {
			writes++;
			throw new Error("response_lost");
		},
		read: async () => receipt,
	};
	await expect(dispatch.run(binding, actions)).rejects.toThrow("response_lost");
	closed = true;
	expect(await dispatch.run(binding, actions)).toBe(receipt);
	expect(writes).toBe(1);
	expect(settled).toBe(1);
});

test("unknown and conflicting recovery cannot write or settle", async () => {
	const permit = { id: "permit", dataHomeId: "home", generation: 1, binding };
	const forbidden = () => {
		throw new Error("unexpected_effect");
	};
	const dispatch = publicationDispatch({
		recoverPermit: () => (permit ? { permit, terminal: null } : null),
		acquire: forbidden,
		settle: forbidden,
	});
	await expect(dispatch.run(binding, { write: forbidden, read: async () => null })).rejects.toThrow(
		"publication_outcome_unknown",
	);
	await expect(
		dispatch.run({ ...binding, payloadDigest: "changed" }, { write: forbidden, read: forbidden }),
	).rejects.toThrow("publication_permit_conflict");
});
