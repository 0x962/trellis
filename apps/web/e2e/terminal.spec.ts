import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { AgentRun, Persona, Ticket } from "@trellis/api";
import { get, patch, post } from "./api";
import { signIn } from "./support";

test("the assigned agent opens an interactive terminal and receives live output", async ({ page }, testInfo) => {
	const repo = await mkdtemp(join(tmpdir(), "trellis-terminal-e2e-"));
	let run: AgentRun | undefined;
	try {
		await writeFile(join(repo, "README.md"), "Terminal fixture\n");
		for (const args of [
			["init", "-q"],
			["add", "."],
			["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "Fixture"],
		])
			execFileSync("git", ["-C", repo, ...args]);
		await post("/projects", { key: "PTY", name: "Interactive terminal" });
		await patch("/projects/PTY", {
			managerConfig: {
				personaId: null,
				concurrency: 3,
				directory: repo,
				ade: "native",
				harness: {
					preset: "custom",
					startCommand: "/bin/sh -c 'stty -echoctl; exec /bin/cat'",
					resumeCommand: "/bin/sh -c 'stty -echoctl; exec /bin/cat'",
				},
			},
		});
		const ticket = await post<Ticket>("/tickets", { project: "PTY", title: "Use the agent CLI" });
		const persona = await post<Persona>("/personas", {
			name: "Terminal fixture",
			kind: "builder",
			instruction: "Wait for terminal input.",
		});
		run = await post<AgentRun>("/agent-runs", { ticket: ticket.identifier, personaId: persona.id });
		expect(run.state).toBe("running");
		const sizes: { cols: number; rows: number }[] = [];
		const inputs: { text: string; userInput?: boolean }[] = [];
		page.on("request", (request) => {
			if (new URL(request.url()).pathname === "/rpc/agentRuns/resize") sizes.push(request.postDataJSON().json);
			if (new URL(request.url()).pathname === "/rpc/agentRuns/terminalInput") inputs.push(request.postDataJSON().json);
		});
		await post(`/agent-runs/${run.id}/terminal/input`, {
			text: "Earlier retained output\n",
			expectedTerminalId: run.terminalId,
		});
		type Frame = { data: string; startOffset: number; nextOffset: number; truncated: boolean };
		await expect
			.poll(async () => atob((await get<Frame>(`/agent-runs/${run!.id}/terminal/output`)).data))
			.toContain("Earlier retained output");
		const frame = await get<Frame>(`/agent-runs/${run.id}/terminal/output`);
		const session = await get(`/agent-runs/${run.id}/session`);
		const offsets: number[] = [];
		await page.route(`**/api/agent-runs/${run.id}/terminal/stream?*`, async (route) => {
			offsets.push(Number(new URL(route.request().url()).searchParams.get("offset")));
			if (offsets.length > 1) return route.continue();
			await route.fulfill({
				contentType: "text/event-stream",
				body: `event: session\ndata: ${JSON.stringify({ session })}\n\nevent: output\ndata: ${JSON.stringify(frame)}\n\n`,
			});
		});
		await signIn(page, `/t/${ticket.identifier}`);
		await page.getByRole("tab", { name: "Agent", exact: true }).click();
		const terminal = page.getByRole("region", { name: `Terminal for ${run.name}`, exact: true });
		await expect(terminal.getByRole("textbox", { name: `Terminal input for ${run.name}`, exact: true })).toBeVisible();
		await expect(terminal.getByRole("alert")).toContainText("The terminal stream closed before the process exited.");
		await terminal.getByRole("button", { name: "Reconnect terminal", exact: true }).click();
		await expect(terminal.getByText("Process active", { exact: true })).toBeVisible();
		expect(offsets).toEqual([0, frame.nextOffset]);
		await expect(terminal.locator(".xterm-accessibility-tree")).toContainText("Earlier retained output");
		await terminal.locator(".xterm-screen").click();
		await page.keyboard.type("First interactive message");
		await page.keyboard.press("Enter");
		await expect(terminal.locator(".xterm-accessibility-tree")).toContainText("First interactive message");
		const typed = inputs.filter((input) => "First interactive message".includes(input.text));
		expect(typed.length).toBeGreaterThan(0);
		expect(typed.every((input) => input.userInput === true)).toBe(true);
		await post(`/agent-runs/${run.id}/terminal/input`, { text: "\x1b[6n", expectedTerminalId: run.terminalId });
		await expect.poll(() => inputs.some((input) => input.text.endsWith("R") && input.userInput === false)).toBe(true);
		await post(`/agent-runs/${run.id}/terminal/input`, {
			text: "Second pushed message\n",
			expectedTerminalId: run.terminalId,
		});
		await expect(terminal.locator(".xterm-accessibility-tree")).toContainText("Second pushed message");
		await expect.poll(() => sizes.length).toBeGreaterThan(0);
		const firstColumns = sizes.at(-1)!.cols;
		await page.setViewportSize({ width: 1920, height: 1000 });
		await expect.poll(() => sizes.at(-1)!.cols).toBeGreaterThan(firstColumns);
		await page.screenshot({ path: testInfo.outputPath("interactive-terminal.png") });
		await page.keyboard.press("Control+]");
		await expect(terminal.getByRole("heading", { name: run.name, exact: true })).toBeFocused();
		const home = join(process.env.TRELLIS_E2E_ROOT!, "home");
		const descriptor = JSON.parse(
			await readFile(join(home, "harness-attempts", run.terminalId!, "launch.json"), "utf8"),
		);
		execFileSync("bun", [fileURLToPath(new URL("../../server/src/agents/harnessHost/hook.ts", import.meta.url))], {
			env: {
				...process.env,
				TRELLIS_HARNESS: "claude",
				TRELLIS_HARNESS_SOCKET: join(home, "runtime/runtime.sock"),
				TRELLIS_ATTEMPT_ID: run.terminalId!,
				TRELLIS_ATTEMPT_TOKEN: descriptor.spec.env.TRELLIS_ATTEMPT_TOKEN,
			},
			input: JSON.stringify({
				hook_event_name: "StopFailure",
				session_id: run.sessionId,
				error: "Provider request failed.",
			}),
		});
		expect((await get<AgentRun[]>(`/agent-runs?ticket=${ticket.identifier}`))[0]?.state).toBe("failed");
		await page.reload();
		await page.getByRole("tab", { name: "Agent", exact: true }).click();
		await expect(terminal.getByRole("textbox", { name: `Terminal input for ${run.name}`, exact: true })).toBeVisible();
		await expect(
			page.getByRole("region", { name: "Agent assignment" }).getByText("failed", { exact: true }),
		).toBeVisible();
		await terminal.locator(".xterm-screen").click();
		await page.keyboard.type("Continue after the failed turn");
		await page.keyboard.press("Enter");
		await expect(terminal.locator(".xterm-accessibility-tree")).toContainText("Continue after the failed turn");
		await post(`/agent-runs/${run.id}/stop`, {});
		expect((await get<AgentRun[]>(`/agent-runs?ticket=${ticket.identifier}`))[0]).toMatchObject({
			terminalId: run.terminalId,
			state: "failed",
			processStatus: "exited",
		});
		await page.reload();
		await page.getByRole("tab", { name: "Agent", exact: true }).click();
		await expect(page.getByText("No assigned agent", { exact: true })).toBeVisible();
	} finally {
		if (run?.id) {
			await post("/native-work/stop", {});
			await post("/native-work/resume", {});
		}
		await rm(repo, { recursive: true, force: true });
	}
});
