import { expect, type Page, test } from "@playwright/test";
import { type AgentRun, DEFAULT_PROJECT_MANAGER_CONFIG, type Persona, type Project } from "@trellis/api";
import { post } from "./api";
import { signIn, toastOf } from "./support";

async function restartFixture(
	page: Page,
	key: string,
	options: {
		stopped?: boolean;
		stopError?: boolean;
		startError?: boolean;
		failedLaunch?: boolean;
		noPersona?: boolean;
	} = {},
) {
	const persona = await post<Persona>("/personas", {
		name: `${key} manager`,
		kind: "manager",
		instruction: "Use the latest saved instruction.",
	});
	const project = await post<Project>("/projects", {
		key,
		name: `${key} restart controls`,
		managerConfig: {
			...DEFAULT_PROJECT_MANAGER_CONFIG,
			personaId: options.noPersona ? null : persona.id,
			dispatchPaused: true,
		},
	});
	let run: AgentRun = {
		id: "01K00000000000000000000001",
		name: "Manager fixture",
		runtime: "native",
		personaId: persona.id,
		personaName: persona.name,
		kind: "manager",
		instruction: "Previous instruction",
		projectId: project.id,
		projectPath: key,
		ticketId: null,
		ticketIdentifier: null,
		state: options.stopped ? "stopped" : "running",
		processStatus: options.stopped ? "exited" : "running",
		observation: null,
		metrics: { durationMs: 0, tokenCount: null },
		workspaceId: "/fixture/manager",
		terminalId: "previous-attempt",
		url: null,
		error: null,
		sessionId: "previous-conversation",
		sessionLost: false,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
	let releaseStop!: () => void;
	const stopGate = new Promise<void>((resolve) => {
		releaseStop = resolve;
	});
	const calls: { operation: string; input: unknown }[] = [];
	let reads = 0;
	await page.routeWebSocket("**/api/agent-runs/**", (socket) => socket.close());
	await page.route("**/rpc/agentRuns/list*", async (route) => {
		reads += 1;
		await route.fulfill({ json: { json: [run] } });
	});
	await page.route("**/rpc/agentRuns/stop", async (route) => {
		calls.push({ operation: "stop", input: route.request().postDataJSON().json });
		await stopGate;
		if (options.stopError)
			return route.fulfill({
				status: 503,
				json: { json: { defined: false, code: "RUNNER_UNAVAILABLE", status: 503, message: "Stop failed" } },
			});
		run = { ...run, state: "stopped", processStatus: "exited" };
		await route.fulfill({ json: { json: run } });
	});
	await page.route("**/rpc/agentRuns/start", async (route) => {
		calls.push({ operation: "start", input: route.request().postDataJSON().json });
		if (options.startError)
			return route.fulfill({
				status: 503,
				json: { json: { defined: false, code: "RUNNER_UNAVAILABLE", status: 503, message: "Start failed" } },
			});
		run = {
			...run,
			state: options.failedLaunch ? "failed" : "running",
			processStatus: options.failedLaunch ? "exited" : "running",
			error: options.failedLaunch ? "Harness unavailable" : null,
		};
		await route.fulfill({ json: { json: run } });
	});
	await signIn(page, `/p/${key}/settings/manager`);
	return { calls, persona, releaseStop, reads: () => reads };
}

const restartButton = (page: Page) =>
	page
		.locator("[data-page-topbar]")
		.getByRole("button", { name: "Restart with new context", exact: true, includeHidden: true });
const restartDialog = (page: Page) => page.getByRole("dialog", { name: "Restart manager with new context?" });

for (const stopped of [false, true]) {
	test(`a ${stopped ? "stopped" : "running"} manager starts fresh only after confirmation and successful stop`, async ({
		page,
	}) => {
		const fixture = await restartFixture(page, stopped ? "MRCB" : "MRCA", { stopped });
		await restartButton(page).click();
		const dialog = restartDialog(page);
		await expect(dialog).toContainText("latest saved persona and project instructions");
		await expect(dialog).toContainText("The workers and workspace stay unchanged.");
		await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
		expect(fixture.calls).toEqual([]);
		await restartButton(page).click();
		await dialog.getByRole("button", { name: "Restart with new context", exact: true }).click();
		await expect.poll(() => fixture.calls.length).toBe(1);
		expect(fixture.calls[0]).toEqual({ operation: "stop", input: { id: "01K00000000000000000000001" } });
		await expect(restartButton(page)).toBeDisabled();
		await expect(
			page.getByRole("button", { name: stopped ? "Resume manager" : "Stop manager", exact: true, includeHidden: true }),
		).toBeDisabled();
		await expect(dialog.getByRole("button", { name: "Restart with new context", exact: true })).toBeDisabled();
		fixture.releaseStop();
		await expect(dialog).toBeHidden();
		expect(fixture.calls[1]).toEqual({
			operation: "start",
			input: { project: stopped ? "MRCB" : "MRCA", personaId: fixture.persona.id, newSession: true },
		});
	});
}

test("a failed stop keeps the dialog open and never starts a new conversation", async ({ page }) => {
	const fixture = await restartFixture(page, "MRCC", { stopError: true });
	await restartButton(page).click();
	await restartDialog(page).getByRole("button", { name: "Restart with new context", exact: true }).click();
	fixture.releaseStop();
	await expect(toastOf(page, "Could not restart the manager")).toBeVisible();
	await expect(restartDialog(page)).toBeVisible();
	expect(fixture.calls.map((call) => call.operation)).toEqual(["stop"]);
});

test("ordinary Resume keeps the existing conversation", async ({ page }) => {
	const fixture = await restartFixture(page, "MRCD", { stopped: true });
	await page.getByRole("button", { name: "Resume manager", exact: true }).click();
	await expect.poll(() => fixture.calls.length).toBe(1);
	expect(fixture.calls[0]).toEqual({
		operation: "start",
		input: { project: "MRCD", personaId: fixture.persona.id, newSession: false },
	});
});

test("a running manager can stop after its configured persona is cleared", async ({ page }) => {
	await restartFixture(page, "MRCG", { noPersona: true });
	await expect(page.getByRole("button", { name: "Stop manager", exact: true })).toBeEnabled();
	await expect(restartButton(page)).toBeDisabled();
});

for (const failedLaunch of [false, true]) {
	test(`a failed ${failedLaunch ? "launch result" : "start request"} refreshes the stopped manager`, async ({
		page,
	}) => {
		const fixture = await restartFixture(page, failedLaunch ? "MRCE" : "MRCF", {
			failedLaunch,
			startError: !failedLaunch,
		});
		const initialReads = fixture.reads();
		await restartButton(page).click();
		await restartDialog(page).getByRole("button", { name: "Restart with new context", exact: true }).click();
		fixture.releaseStop();
		await expect(toastOf(page, "Could not restart the manager")).toBeVisible();
		await expect.poll(fixture.reads).toBeGreaterThan(initialReads);
		await expect(page.getByRole("button", { name: "Resume manager", exact: true, includeHidden: true })).toBeAttached();
		expect(fixture.calls.map((call) => call.operation)).toEqual(["stop", "start"]);
	});
}
