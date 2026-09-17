import { expect, test } from "bun:test";
import { join } from "node:path";
import { originDir } from "../../../../../../../test/originDir";

test("the manager bridge preserves API identity and refuses technical tools without an HTTP request", async () => {
	const requests: Request[] = [];
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch(request) {
			requests.push(request.clone());
			return Response.json({ json: { id: "ticket-1", title: "record" } });
		},
	});
	const entry = join(originDir(import.meta.dir), "entry.ts");
	const messages = [
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } },
		{ jsonrpc: "2.0", method: "notifications/initialized" },
		{ jsonrpc: "2.0", id: 2, method: "tools/list" },
		{
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: { name: "trellis_tickets_get", arguments: { ticket: "TRL-1" } },
		},
		{
			jsonrpc: "2.0",
			id: 4,
			method: "tools/call",
			params: { name: "trellis_agentRuns_terminalInput", arguments: { text: "git merge main" } },
		},
	];
	const child = Bun.spawn([process.execPath, entry], {
		env: {
			...process.env,
			TRELLIS_URL: server.url.href.replace(/\/$/, ""),
			TRELLIS_ACTOR: "agent:manager-1",
			TRELLIS_AUTH_TOKEN: "test-host-token",
			TRELLIS_ATTEMPT_TOKEN: "test-attempt-token",
			TRELLIS_ATTEMPT_ID: "test-attempt",
		},
		stdin: new Blob([`${messages.map((message) => JSON.stringify(message)).join("\n")}\n`]),
		stdout: "pipe",
		stderr: "pipe",
	});
	try {
		const output = await new Response(child.stdout).text();
		const error = await new Response(child.stderr).text();
		expect(await child.exited, error).toBe(0);
		const replies = output
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(replies).toHaveLength(4);
		expect(replies.find((reply) => reply.id === 3).result.content[0].text).toContain("ticket-1");
		expect(replies.find((reply) => reply.id === 4).result.isError).toBe(true);
		expect(requests).toHaveLength(1);
		expect(new URL(requests[0]!.url).pathname).toBe("/rpc/tickets/get");
		expect(requests[0]!.headers.get("x-trellis-actor")).toBe("agent:manager-1");
		expect(requests[0]!.headers.get("x-trellis-attempt")).toBe("test-attempt-token");
		expect(requests[0]!.headers.get("authorization")).toBe("Bearer test-host-token");
	} finally {
		child.kill();
		server.stop(true);
	}
});
