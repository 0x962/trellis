import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
// @ts-expect-error The plugin runs as native JavaScript in OpenCode.
import { openCodeControl } from "../../../../../src/agents/harnesses/opencode/control.mjs";
import { interruptOpenCode, sendOpenCode } from "../../../../../src/agents/harnesses/opencode/interruptOpenCode.ts";

test("OpenCode control authenticates and fences the exact active turn", async () => {
	const socket = `/tmp/trellis-oc-test-${randomUUID()}.sock`;
	let current = { sessionId: "ses_1", turnId: "turn_1", working: true };
	const calls: string[] = [];
	const gate = Promise.withResolvers<void>();
	const entered = Promise.withResolvers<void>();
	const control = await openCodeControl({
		socket,
		token: "secret",
		current: () => current,
		abort: async (id: string) => {
			calls.push(id);
			entered.resolve();
			await gate.promise;
			return { data: true };
		},
	});
	try {
		expect((await stat(socket)).mode & 0o777).toBe(0o600);
		await expect(interruptOpenCode(socket, "wrong", "ses_1", "turn_1")).rejects.toThrow("Unauthorized");
		await expect(interruptOpenCode(socket, "secret", "ses_2", "turn_1")).rejects.toThrow("STALE_TURN");
		await expect(interruptOpenCode(socket, "secret", "ses_1", "old")).rejects.toThrow("STALE_TURN");
		const aborted = interruptOpenCode(socket, "secret", "ses_1", "turn_1");
		await entered.promise;
		const transition = control.beforePrompt().then(() => {
			current = { sessionId: "ses_1", turnId: "turn_2", working: true };
		});
		expect(current.turnId).toBe("turn_1");
		await expect(interruptOpenCode(socket, "secret", "ses_1", "turn_1")).rejects.toThrow("INTERRUPT_PENDING");
		gate.resolve();
		await expect(aborted).resolves.toEqual({ accepted: true, sessionId: "ses_1", turnId: "turn_1" });
		await transition;
		await expect(interruptOpenCode(socket, "secret", "ses_1", "turn_1")).rejects.toThrow("STALE_TURN");
		expect(calls).toEqual(["ses_1"]);
	} finally {
		gate.resolve();
		await control.close();
	}
});

test("OpenCode control reports native abort refusal and does not claim idle", async () => {
	const socket = `/tmp/trellis-oc-test-${randomUUID()}.sock`;
	const control = await openCodeControl({
		socket,
		token: "secret",
		current: () => ({ sessionId: "s", turnId: "t", working: true }),
		abort: async () => ({ error: { message: "native refusal" } }),
	});
	try {
		await expect(interruptOpenCode(socket, "secret", "s", "t")).rejects.toThrow("native refusal");
	} finally {
		await control.close();
	}
});

test("OpenCode control rejects a repeated interrupt before the idle event arrives", async () => {
	const socket = `/tmp/trellis-oc-test-${randomUUID()}.sock`;
	let calls = 0;
	const control = await openCodeControl({
		socket,
		token: "secret",
		current: () => ({ sessionId: "s", turnId: "t", working: true }),
		abort: async () => {
			calls++;
			return { data: true };
		},
	});
	try {
		await interruptOpenCode(socket, "secret", "s", "t");
		await expect(interruptOpenCode(socket, "secret", "s", "t")).rejects.toThrow("INTERRUPT_ALREADY_REQUESTED");
		expect(calls).toBe(1);
	} finally {
		await control.close();
	}
});

test("OpenCode interrupt crosses the authenticated socket boundary in a separate process", async () => {
	const socket = `/tmp/trellis-oc-process-${randomUUID()}.sock`;
	const source = new URL("../../../../../src/agents/harnesses/opencode/control.mjs", import.meta.url).href;
	const child = Bun.spawn(
		[
			process.execPath,
			"--eval",
			`const {openCodeControl}=await import(${JSON.stringify(source)});const control=await openCodeControl({socket:${JSON.stringify(socket)},token:"private",current:()=>({sessionId:"session",turnId:"turn",working:true}),abort:async()=>({data:true})});console.log("ready");await Bun.stdin.text();await control.close();`,
		],
		{ stdin: "pipe", stdout: "pipe", stderr: "pipe" },
	);
	try {
		const reader = child.stdout.getReader();
		expect(new TextDecoder().decode((await reader.read()).value)).toContain("ready");
		reader.releaseLock();
		await expect(interruptOpenCode(socket, "private", "session", "turn")).resolves.toEqual({
			accepted: true,
			sessionId: "session",
			turnId: "turn",
		});
		await expect(interruptOpenCode(socket, "foreign", "session", "turn")).rejects.toThrow("Unauthorized");
	} finally {
		child.stdin.end();
		expect(await child.exited).toBe(0);
	}
});

test("OpenCode prompt API accepts only the selected session and hands a prompt to a working session", async () => {
	const socket = `/tmp/trellis-oc-test-${randomUUID()}.sock`;
	const prompts: string[] = [];
	let working = false;
	const control = await openCodeControl({
		socket,
		token: "secret",
		current: () => ({ sessionId: "s", turnId: "t", working }),
		abort: async () => ({ data: true }),
		prompt: async (id: string, text: string) => {
			working = true;
			prompts.push(`${id}:${text}`);
			return { response: { status: 204 } };
		},
	});
	try {
		await expect(sendOpenCode(socket, "secret", "wrong", "text")).rejects.toThrow("STALE_SESSION");
		await expect(sendOpenCode(socket, "secret", "s", "exact prompt")).resolves.toEqual({
			accepted: true,
			sessionId: "s",
		});
		await expect(sendOpenCode(socket, "secret", "s", "second")).resolves.toEqual({ accepted: true, sessionId: "s" });
		expect(prompts).toEqual(["s:exact prompt", "s:second"]);
	} finally {
		await control.close();
	}
});
