import { expect, test } from "bun:test";
import { deadlineHandler } from "../deadlineHandler";
import type { GroupDeadlineRequest, GroupDeadlineScope } from "../groupDeadlineContract";
import { groupScopeReader } from "./groupScopeReader";

const input: GroupDeadlineRequest = {
	executionId: "execution",
	publicationId: "publication",
	engineJobId: "00000000-0000-4000-8000-000000000001",
	engineEpoch: 1,
	scopeVertexId: "scope",
	occurrenceKey: "group.501",
};
const proof: Omit<GroupDeadlineScope, "occurrenceKey"> = {
	executionId: input.executionId,
	publicationId: input.publicationId,
	engineJobId: input.engineJobId,
	engineEpoch: input.engineEpoch,
	scopeVertexId: input.scopeVertexId,
	occurrence: {
		nodeId: "group",
		occurrenceKey: input.occurrenceKey,
		parentOccurrenceKey: null,
		phase: "children",
		iterationPath: [{ loopNodeId: "loop", round: 501 }],
	},
	scope: {
		parentOccurrenceKey: null,
		phase: "children",
		iterationPath: [],
		inputReceiptIds: [],
		groupDeadlineRefs: [],
		deadlineAt: null,
	},
	groupDefinition: { version: 1, groupNodeId: "group", minutes: 2, scopeVertexId: "scope" },
};

test("the authenticated callback reads retained engine proof before the reserve service", async () => {
	let held = false;
	let reserved = false;
	const readGroupScope = groupScopeReader({
		endpoint: "http://127.0.0.1:9876",
		authenticationFile: "private",
		dependencies: {
			readAuthenticationFile: async () => "engine-token",
			fetch: async (url, init) => {
				expect(held).toBe(true);
				expect(String(url)).toBe("http://127.0.0.1:9876/trellis-v1/group-scopes/read");
				expect(new Headers(init?.headers).get("authorization")).toBe("Bearer engine-token");
				expect(new Headers(init?.headers).get("x-trellis-capability-id")).toBe("grant");
				expect(JSON.parse(String(init?.body))).toEqual(input);
				return Response.json(proof);
			},
		},
	});
	const handler = deadlineHandler({
		withAuthenticatedNativeReservation: async (authorization, action) => {
			expect(authorization).toBe("Bearer callback-token");
			held = true;
			const result = await action();
			held = false;
			return result;
		},
		readGroupScope,
		reserve: async ({ request, capabilityId }) => {
			expect(held).toBe(true);
			expect(capabilityId).toBe("grant");
			expect(request).toEqual({ ...proof, occurrenceKey: input.occurrenceKey });
			reserved = true;
			return {
				deadline: {
					deadlineId: "stable",
					groupOccurrenceKey: input.occurrenceKey,
					budgetMs: 120_000,
					launchedAt: null,
					deadlineAt: null,
					launchReceiptId: null,
				},
				groupDeadlineRefs: ["stable"],
				deadlineAt: null,
			};
		},
	});
	const response = await handler(
		new Request("http://localhost/api/langflow-private/v1/group-deadlines", {
			method: "POST",
			headers: { authorization: "Bearer callback-token", "x-trellis-capability-id": "grant" },
			body: JSON.stringify(input),
		}),
	);
	expect(response.status).toBe(200);
	expect(reserved).toBe(true);
	expect(held).toBe(false);
});

test("readback rejects unknown delivery, HTTP errors, changed identity, and extra proof fields", async () => {
	for (const response of [
		null,
		new Response("conflict", { status: 409 }),
		Response.json({ ...proof, engineEpoch: 2 }),
		Response.json({ ...proof, injected: true }),
	]) {
		const read = groupScopeReader({
			endpoint: "http://127.0.0.1:9876",
			authenticationFile: "private",
			dependencies: {
				readAuthenticationFile: async () => "token",
				fetch: async () => {
					if (response === null) throw new Error("engine down");
					return response;
				},
			},
		});
		await expect(read(input, "grant", new AbortController().signal)).rejects.toThrow();
	}
});
