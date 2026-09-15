import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { AgentRun, Persona } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

async function managerFixture(key: string) {
	const repo = await mkdtemp(join(tmpdir(), "trellis-manager-terminal-"));
	await writeFile(join(repo, "README.md"), "Manager terminal fixture\n");
	for (const args of [
		["init", "-q"],
		["add", "."],
		["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "Fixture"],
	])
		execFileSync("git", ["-C", repo, ...args]);
	const persona = await post<Persona>("/personas", {
		name: `${key} terminal fixture`,
		kind: "manager",
		instruction: "Wait for terminal input.",
	});
	await post("/projects", {
		key,
		name: `${key} manager terminal`,
		managerConfig: {
			personaId: persona.id,
			concurrency: 1,
			directory: repo,
			ade: "native",
			trustedDirectory: true,
			dispatchPaused: true,
			harness: {
				preset: "custom",
				startCommand: "/bin/sh -c 'stty -echoctl; exec /bin/cat'",
				resumeCommand: "/bin/sh -c 'stty -echoctl; exec /bin/cat'",
			},
		},
	});
	const run = await post<AgentRun>("/agent-runs", { project: key, personaId: persona.id });
	expect(run.processStatus).toBe("running");
	return {
		run,
		async close() {
			await post(`/agent-runs/${run.id}/stop`, {});
			await rm(repo, { recursive: true, force: true });
		},
	};
}

const terminalFor = (page: Page, run: AgentRun) =>
	page.getByRole("region", { name: `Terminal for ${run.name}`, exact: true });

test("the manager terminal fills the page and resizes its native PTY", async ({ page }, testInfo) => {
	const fixture = await managerFixture("MTF");
	try {
		const sizes: { cols: number; rows: number }[] = [];
		page.on("request", (request) => {
			if (new URL(request.url()).pathname === "/rpc/agentRuns/resize") sizes.push(request.postDataJSON().json);
		});
		await page.setViewportSize({ width: 1280, height: 800 });
		await signIn(page, "/p/MTF/settings/manager");
		const terminal = terminalFor(page, fixture.run);
		await expect(terminal.getByText("Process active", { exact: true })).toBeVisible();
		const main = await page.getByRole("main").boundingBox();
		const canvas = await terminal.locator(".terminal-canvas").boundingBox();
		expect(canvas!.height).toBeGreaterThan(main!.height - 140);
		expect(canvas!.width).toBeGreaterThan(main!.width - 48);
		await expect.poll(() => sizes.length).toBeGreaterThan(0);
		const initial = sizes.at(-1)!;
		await page.setViewportSize({ width: 1600, height: 1000 });
		await expect.poll(() => sizes.at(-1)!.rows).toBeGreaterThan(initial.rows);
		await expect.poll(() => sizes.at(-1)!.cols).toBeGreaterThan(initial.cols);
		const large = sizes.at(-1)!;
		await page.setViewportSize({ width: 1100, height: 650 });
		await expect.poll(() => sizes.at(-1)!.rows).toBeLessThan(large.rows);
		await expect.poll(() => sizes.at(-1)!.cols).toBeLessThan(large.cols);
		await expect(page.getByRole("region", { name: "Manager terminal", exact: true })).toBeVisible();
		await terminal.locator(".xterm-screen").click();
		await page.keyboard.press("Control+]");
		await expect(page.getByRole("link", { name: "Manager settings", exact: true })).toBeFocused();
		await page.screenshot({ path: testInfo.outputPath("manager-terminal.png") });
	} finally {
		await fixture.close();
	}
});

test("manager settings leave the terminal page and preserve its process and output", async ({ page }) => {
	const fixture = await managerFixture("MTP");
	try {
		const mutations: string[] = [];
		const offsets: number[] = [];
		page.on("request", (request) => {
			const url = new URL(request.url());
			if (["/rpc/agentRuns/start", "/rpc/agentRuns/stop"].includes(url.pathname)) mutations.push(url.pathname);
			if (url.pathname === `/api/agent-runs/${fixture.run.id}/terminal/stream`)
				offsets.push(Number(url.searchParams.get("offset")));
		});
		await post(`/agent-runs/${fixture.run.id}/terminal/input`, {
			text: "Retained manager output before settings\n",
			expectedTerminalId: fixture.run.terminalId,
		});
		await signIn(page, "/p/MTP/settings/manager");
		const terminal = terminalFor(page, fixture.run);
		await expect(terminal.locator(".xterm-accessibility-tree")).toContainText(
			"Retained manager output before settings",
		);
		await expect(page.getByRole("navigation", { name: "Manager navigation", exact: true })).toHaveCount(0);
		await expect(page.getByRole("switch", { name: "Automatic dispatch", exact: true })).toHaveCount(0);
		await expect(page.getByRole("link", { name: "General", exact: true })).toHaveCount(0);
		await expect(page.getByRole("link", { name: "Harness", exact: true })).toHaveCount(0);
		await expect(page.getByText("Agent result", { exact: true })).toHaveCount(0);
		await expect(page.getByRole("heading", { name: fixture.run.name, exact: true })).toHaveCount(1);
		const before = await get<{ id: string; pid: number }>(`/agent-runs/${fixture.run.id}/session`);
		expect(before).toMatchObject({ id: fixture.run.terminalId, status: "running", pid: expect.any(Number) });
		expect(before.pid).toBeGreaterThan(0);
		await page.getByRole("link", { name: "Manager settings", exact: true }).click();
		await expect(page).toHaveURL(/\/p\/MTP\/settings#manager$/);
		await expect(page.getByRole("navigation", { name: "Project settings", exact: true })).toBeVisible();
		await expect(terminal).toHaveCount(0);
		await post(`/agent-runs/${fixture.run.id}/terminal/input`, {
			text: "Manager output while settings are open\n",
			expectedTerminalId: fixture.run.terminalId,
		});
		await page.goBack();
		await expect(page).toHaveURL(/\/p\/MTP\/settings\/manager$/);
		await expect(terminal.locator(".xterm-accessibility-tree")).toContainText(
			"Retained manager output before settings",
		);
		await expect(terminal.locator(".xterm-accessibility-tree")).toContainText("Manager output while settings are open");
		const after = await get<{ id: string; pid: number }>(`/agent-runs/${fixture.run.id}/session`);
		expect(after.id).toBe(before.id);
		expect(after.pid).toBe(before.pid);
		expect((await get<AgentRun[]>("/agent-runs?project=MTP")).map((run) => run.id)).toEqual([fixture.run.id]);
		expect(offsets).toEqual([0, 0]);
		expect(mutations).toEqual([]);
	} finally {
		await fixture.close();
	}
});

test("a stopped manager offers a start control without another process", async ({ page }) => {
	const fixture = await managerFixture("MTS");
	try {
		await post(`/agent-runs/${fixture.run.id}/stop`, {});
		await signIn(page, "/p/MTS/settings/manager");
		await expect(page.getByRole("button", { name: /^(Start|Resume) manager$/ })).toBeEnabled();
		await expect(page.getByRole("button", { name: "Stop manager", exact: true })).toHaveCount(0);
		await expect(page.getByRole("link", { name: "Manager settings", exact: true })).toBeVisible();
		expect((await get<AgentRun[]>("/agent-runs?project=MTS"))[0]).toMatchObject({
			id: fixture.run.id,
			terminalId: fixture.run.terminalId,
			processStatus: "exited",
		});
	} finally {
		await fixture.close();
	}
});

test("an unconfigured manager directs the user to project settings", async ({ page }) => {
	await post("/projects", { key: "MTU", name: "Unconfigured manager" });
	await signIn(page, "/p/MTU/settings/manager");
	await expect(page.getByText("Choose a manager persona in project settings.", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Start manager", exact: true })).toBeDisabled();
	await expect(page.getByRole("link", { name: "Manager settings", exact: true })).toHaveAttribute(
		"href",
		"/p/MTU/settings#manager",
	);
	await expect(page.getByRole("navigation", { name: "Manager navigation", exact: true })).toHaveCount(0);
});

test("manager loading and errors keep process controls disabled until a retry succeeds", async ({ page }) => {
	await post("/projects", { key: "MTE", name: "Manager load states" });
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let failing = true;
	await page.route("**/rpc/agentRuns/list*", async (route) => {
		await gate;
		if (!failing) return route.continue();
		await route.fulfill({
			status: 503,
			json: {
				json: { defined: false, code: "INTERNAL_SERVER_ERROR", status: 503, message: "Manager list unavailable" },
			},
		});
	});
	try {
		await signIn(page, "/p/MTE/settings/manager");
		await expect(page.getByRole("status").filter({ hasText: "Load manager…" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Start manager", exact: true })).toBeDisabled();
		release();
		await expect(page.getByRole("alert").filter({ hasText: "Could not load manager." })).toBeVisible();
		await expect(page.getByRole("button", { name: "Start manager", exact: true })).toBeDisabled();
		failing = false;
		await page.getByRole("button", { name: "Reload manager", exact: true }).click();
		await expect(page.getByText("Choose a manager persona in project settings.", { exact: true })).toBeVisible();
		await expect(page.getByRole("alert").filter({ hasText: "Could not load manager." })).toHaveCount(0);
	} finally {
		release();
	}
});
