import { describe, expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { actor, agentRunId, projectId } from "../../../fixtures.ts";

const messageId = "01J8Z6X4Q3M2K1H0G9F8E7D6M1";

const message = (overrides: Record<string, unknown> = {}) => ({
	id: messageId,
	projectId,
	channel: "ai",
	body: "rebase on main",
	actor: { name: agentRunId, kind: "agent", displayName: "Builder" },
	createdAt: "2026-09-09T12:34:56.000Z",
	...overrides,
});

const channel = (name: string, messageCount = 0) => ({
	projectId,
	name,
	messageCount,
	latestId: null,
	lastMessageAt: null,
	createdAt: "2026-09-09T10:00:00.000Z",
});

describe("chat", () => {
	test("chat post sends the project, the channel, and the body, and prints the record", async () => {
		const result = await runCli(["chat", "post", "TRL", "ai", "--body", "hello"], {
			"chat.post": message({ body: "hello", actor }),
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "chat.post" });
		expect(result.calls[0]!.input).toEqual({ project: "TRL", channel: "ai", body: "hello" });
		const quiet = await runCli(
			["chat", "post", "TRL", "#ai", "--body", "-", "--quiet"],
			{ "chat.post": message() },
			{
				stdin: "from stdin",
			},
		);
		expect(quiet.calls[0]!.input).toEqual({ project: "TRL", channel: "#ai", body: "from stdin" });
		expect(quiet.stdout).toBe(`${messageId}\n`);
	});

	test("chat read prints IRC lines on a TTY and the page as JSON on a pipe", async () => {
		const page = { channel: "ai", items: [message()], latestId: messageId };
		const tty = await runCli(
			["chat", "read", "TRL", "ai", "--after", messageId, "--limit", "10"],
			{ "chat.list": page },
			{ tty: true },
		);
		expect(tty.code).toBe(0);
		expect(tty.calls[0]!.input).toEqual({ project: "TRL", channel: "ai", after: messageId, limit: 10 });
		expect(tty.stdout).toBe(`#ai 12:34:56 <Builder ${agentRunId}> rebase on main\n`);
		const piped = await runCli(["chat", "read", "TRL", "ai"], { "chat.list": page });
		expect(JSON.parse(piped.stdout)).toEqual(page);
		const empty = await runCli(
			["chat", "read", "TRL", "ai"],
			{ "chat.list": { ...page, items: [], latestId: null } },
			{ tty: true },
		);
		expect(empty.stdout).toBe("#ai has no messages.\n");
	});

	test("chat channels lists the room and chat create adds a channel", async () => {
		const listed = await runCli(
			["chat", "channels", "TRL"],
			{ "chat.channels": [channel("ai", 3), channel("general")] },
			{ tty: true },
		);
		expect(listed.code).toBe(0);
		expect(listed.stdout).toContain("#ai");
		expect(listed.stdout).toContain("#general");
		const created = await runCli(["chat", "create", "TRL", "release", "--quiet"], {
			"chat.createChannel": channel("release"),
		});
		expect(created.calls[0]!.input).toEqual({ project: "TRL", channel: "release" });
		expect(created.stdout).toBe("release\n");
	});
});
