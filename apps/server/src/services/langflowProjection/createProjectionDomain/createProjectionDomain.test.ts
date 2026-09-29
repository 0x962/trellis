import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DeliveryAuthorityV1Schema } from "../../../langflowContracts";
import { fixture } from "../testFixture";
import { createProjectionDomain } from "./createProjectionDomain";

const authority = DeliveryAuthorityV1Schema.parse(
	JSON.parse(readFileSync(new URL("../../../langflowContracts/fixtures/authority.json", import.meta.url), "utf8")),
);

test("each engine read follows a fresh public revision and keeps original authority bytes", async () => {
	const calls: string[] = [];
	const authorityBytes = `${JSON.stringify(authority, null, 2)}\n`;
	let after = 0;
	const domain = createProjectionDomain({
		hostId: authority.hostId,
		signal: new AbortController().signal,
		readAuthorityBytes: () => authorityBytes,
		state: async ({ executionId }) => {
			calls.push(`state:${after}`);
			return {
				executionId,
				publicationId: authority.publicationId,
				engineJobId: authority.engineJobId,
				authority,
				expectedRevision: 10 + after,
				after,
			};
		},
		engine: {
			request: async (input) => {
				calls.push(`read:${after}`);
				expect(JSON.parse(input.body!).authorityBytes).toBe(authorityBytes);
				expect(input.capabilityId).toBe(authority.capabilityId);
				return {
					state: "received",
					status: 200,
					contentType: "application/json",
					bytes: new TextEncoder().encode("{}"),
				};
			},
		},
		apply: async ({ prepared, authorityBytes: original }) => {
			calls.push(`apply:${after}`);
			expect(prepared.expectedRevision).toBe(10 + after);
			expect(original).toBe(authorityBytes);
			after += 1;
			return { state: after === 1 ? "advanced" : "unchanged", view: fixture().view };
		},
		recovery: async () => ({ items: [], nextAfterExecutionId: null }),
	});
	await domain.committed({ executionId: authority.executionId });
	expect(calls).toEqual(["state:0", "read:0", "apply:0", "state:1", "read:1", "apply:1"]);
});

test("a canceled host signal prevents recovery and engine requests", async () => {
	const abort = new AbortController();
	abort.abort();
	const unexpected = async (): Promise<never> => {
		throw new Error("unexpected_call");
	};
	const domain = createProjectionDomain({
		hostId: "host",
		signal: abort.signal,
		state: unexpected,
		apply: unexpected,
		recovery: unexpected,
		engine: { request: unexpected },
		readAuthorityBytes: () => "",
	});
	await domain.recover();
	await domain.committed({ executionId: "execution" });
});
