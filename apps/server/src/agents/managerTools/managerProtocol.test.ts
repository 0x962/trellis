import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { managerProtocol } from "./managerProtocol";

test("manager protocol initializes and advertises only the configured tool catalog", async () => {
	const handle = managerProtocol({ list: () => [{ name: "trellis_tickets_get" }], call: async () => ({}) });
	expect(
		await handle(
			JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }),
		),
	).toMatchObject({
		jsonrpc: "2.0",
		id: 1,
		result: { protocolVersion: "2025-11-25", capabilities: { tools: {} } },
	});
	expect(await handle(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))).toBeUndefined();
	expect(await handle(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).toMatchObject({
		id: 2,
		result: { tools: [{ name: "trellis_tickets_get" }] },
	});
});

test("manager tool errors preserve API codes and actionable details without error internals", async () => {
	const data = {
		issues: [{ path: ["id"], message: "This assignment is closed. Start a new attempt before sending a message." }],
	};
	const failure = new ORPCError("INPUT_VALIDATION_FAILED", {
		message: "The input does not match the schema",
		data,
		cause: new Error("private internal cause"),
	});
	const handle = managerProtocol({
		list: () => [],
		call: async () => {
			throw failure;
		},
	});
	const response = await handle(
		JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: "trellis_agentRuns_send", arguments: {} },
		}),
	);
	expect(response).toMatchObject({
		result: {
			isError: true,
			content: [{ type: "text", text: JSON.stringify({ code: failure.code, message: failure.message, data }) }],
		},
	});
	expect(JSON.stringify(response)).not.toContain("private internal cause");
	expect(JSON.stringify(response)).not.toContain("stack");
});

test("manager tool errors identify the invalid input field", async () => {
	const handle = managerProtocol({
		list: () => [],
		call: async (_name, input) => z.object({ generation: z.number() }).parse(input),
	});
	const response = await handle(
		JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: "trellis_controller_handle", arguments: { generation: "old" } },
		}),
	);
	const serialized = JSON.stringify(response);
	expect(response).toMatchObject({ result: { isError: true } });
	expect(serialized).toContain("INPUT_VALIDATION_FAILED");
	expect(serialized).toContain("generation");
	expect(serialized).toContain("expected number");
});

test("manager protocol returns API results and tool errors as data", async () => {
	const handle = managerProtocol({
		list: () => [],
		call: async (name, args) => {
			if (name !== "trellis_tickets_get") throw new Error("Unknown manager tool");
			return args;
		},
	});
	const request = (name: string) =>
		JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: { ticket: "TRL-1" } } });
	expect(await handle(request("trellis_tickets_get"))).toMatchObject({
		result: { content: [{ type: "text", text: '{"ticket":"TRL-1"}' }] },
	});
	expect(await handle(request("Bash"))).toMatchObject({
		result: { isError: true, content: [{ type: "text", text: "Unknown manager tool" }] },
	});
	expect(await handle("invalid json")).toMatchObject({ id: null, error: { code: -32700 } });
	expect(await handle(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "runShell" }))).toMatchObject({
		id: 4,
		error: { code: -32601 },
	});
});
