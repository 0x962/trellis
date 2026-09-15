import { expect, test } from "bun:test";
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
