import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { managerTools } from "../../../managerTools/managerTools.ts";
import { managerAdapter } from "./managerAdapter.ts";

test("dynamic calls use the manager allowlist and retain tool failures", async () => {
	const invoked: string[] = [];
	const tools = managerTools(async (operation) => {
		invoked.push(operation);
		return { exact: "result" };
	});
	const adapter = managerAdapter(tools, () => "manager-thread");
	expect(adapter.tools).toEqual(tools.list().map((tool) => ({ type: "function", ...tool })));
	expect(
		await adapter.request({
			method: "item/tool/call",
			params: { threadId: "manager-thread", tool: "trellis_projects_list", arguments: {} },
		}),
	).toEqual({ success: true, contentItems: [{ type: "inputText", text: '{"exact":"result"}' }] });
	expect(invoked).toEqual(["projects.list"]);
	expect(
		await adapter.request({
			method: "item/tool/call",
			params: { threadId: "manager-thread", tool: "exec_command", arguments: { cmd: "touch /tmp/forbidden" } },
		}),
	).toMatchObject({ success: false });
	expect(invoked).toEqual(["projects.list"]);
	expect(await adapter.request({ method: "item/tool/requestUserInput", params: {} })).toBeUndefined();
});

test("dynamic tool errors preserve API details and invalid input paths", async () => {
	const adapter = managerAdapter(
		managerTools(async () => {
			throw new ORPCError("CONFLICT", { message: "Stale manager generation", data: { reason: "STALE_GENERATION" } });
		}),
		() => "manager-thread",
	);
	const failure = await adapter.request({
		method: "item/tool/call",
		params: { threadId: "manager-thread", tool: "trellis_projects_list", arguments: {} },
	});
	expect(JSON.parse(failure!.contentItems[0]!.text)).toEqual({
		code: "CONFLICT",
		message: "Stale manager generation",
		data: { reason: "STALE_GENERATION" },
	});
	const invalid = await adapter.request({
		method: "item/tool/call",
		params: { threadId: "manager-thread", tool: "trellis_tickets_get", arguments: {} },
	});
	expect(JSON.parse(invalid!.contentItems[0]!.text)).toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["ticket"] }] },
	});
});

test("a second native thread cannot use this manager identity", async () => {
	let invoked = false;
	const adapter = managerAdapter(
		managerTools(async () => {
			invoked = true;
		}),
		() => "owned-thread",
	);
	expect(
		await adapter.request({
			method: "item/tool/call",
			params: { threadId: "other-thread", tool: "trellis_projects_list", arguments: {} },
		}),
	).toMatchObject({ success: false });
	expect(invoked).toBe(false);
});
