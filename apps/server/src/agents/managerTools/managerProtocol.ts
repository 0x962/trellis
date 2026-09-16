import { z } from "zod";
import { toolError } from "./toolError/toolError.ts";

const envelope = z.object({
	jsonrpc: z.literal("2.0"),
	id: z.union([z.string(), z.number()]).optional(),
	method: z.string(),
	params: z.unknown().optional(),
});
const toolCall = z.object({ name: z.string(), arguments: z.unknown() });
type Tools = { list: () => unknown[]; call: (name: string, input: unknown) => Promise<unknown> };

export const managerProtocol = (tools: Tools) => async (line: string) => {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } };
	}
	const parsed = envelope.safeParse(value);
	if (!parsed.success)
		return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC request" } };
	const { id, method, params } = parsed.data;
	if (id === undefined) return;
	const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
	if (method === "initialize") {
		const requested = z.object({ protocolVersion: z.string() }).safeParse(params);
		const versions = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
		return reply({
			protocolVersion:
				requested.success && versions.includes(requested.data.protocolVersion)
					? requested.data.protocolVersion
					: versions[0],
			capabilities: { tools: {} },
			serverInfo: { name: "trellis-manager", version: "1" },
		});
	}
	if (method === "ping") return reply({});
	if (method === "tools/list") return reply({ tools: tools.list() });
	if (method === "tools/call") {
		try {
			const input = toolCall.parse(params);
			const result = await tools.call(input.name, input.arguments);
			return reply({ content: [{ type: "text", text: JSON.stringify(result) }] });
		} catch (error) {
			return reply({ isError: true, content: [{ type: "text", text: toolError(error) }] });
		}
	}
	return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } };
};
