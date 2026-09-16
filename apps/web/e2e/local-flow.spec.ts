import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { Flow, FlowDoc, FlowExecutionRecord, Persona, Ticket } from "@trellis/api";
import { ulid } from "ulid";
import { get, patch, post, put } from "./api";
import { signIn } from "./support";

let directory: string;
let persona: Persona;
test.beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), "trellis-flow-e2e-"));
	await post("/projects", {
		key: "LFX",
		name: "Local flow controls",
		managerConfig: {
			personaId: null,
			concurrency: 3,
			directory,
			ade: "native",
			dispatchPaused: true,
		},
	});
	persona = await post<Persona>("/personas", { name: "Flow control fixture", kind: "builder", instruction: "Wait." });
});
test.afterAll(async () => rm(directory, { recursive: true, force: true }));

async function fixture(name: string) {
	const ticket = await post<Ticket>("/tickets", { project: "LFX", title: name });
	const flow = await post<Flow>("/flows", { name });
	const doc = await put<FlowDoc>(`/flows/${flow.id}/graph`, {
		nodes: [
			{
				id: ulid(),
				parentId: null,
				kind: "human",
				title: "Review the result",
				instruction: "Read the evidence.",
				personaId: null,
				parallel: false,
				minutes: null,
				maxRounds: null,
				x: 0,
				y: 0,
				width: null,
				height: null,
			},
		],
		edges: [],
	});
	return { ticket, flow, doc };
}

async function openStart(page: Page, ticket: Ticket, flow: Flow) {
	await signIn(page, `/t/${ticket.identifier}`);
	await page.getByRole("tab", { name: "Flows", exact: true }).click();
	await page.getByRole("button", { name: "Start a local flow", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Start a local flow", exact: true });
	await dialog.getByRole("combobox", { name: "Flow", exact: true }).click();
	await page.getByRole("option", { name: flow.name, exact: true }).click();
	await dialog.getByRole("combobox", { name: "Default worker persona", exact: true }).click();
	await page.getByRole("option", { name: persona.name, exact: true }).click();
	return dialog;
}

const executions = (ticket: Ticket) => get<FlowExecutionRecord[]>(`/flow-executions?ticket=${ticket.identifier}`);

test("a lost start response reuses one flow and approval retains the frozen step and notes", async ({ page }) => {
	const { ticket, flow, doc } = await fixture("Approval controls");
	const dialog = await openStart(page, ticket, flow);
	const starts: string[] = [];
	await page.route("**/rpc/flowExecutions/start", async (route) => {
		starts.push(route.request().postData()!);
		if (starts.length === 1) {
			const response = await route.fetch();
			expect(response.ok()).toBe(true);
			await route.abort();
		} else await route.continue();
	});
	await dialog.getByRole("button", { name: "Start flow", exact: true }).click();
	await expect(dialog.getByRole("alert")).toBeVisible();
	await dialog.getByRole("button", { name: "Start flow", exact: true }).click();
	await expect(dialog).toHaveCount(0);
	expect(starts).toHaveLength(2);
	expect(starts[0]).toBe(starts[1]);
	const [execution] = await executions(ticket);
	expect(await executions(ticket)).toHaveLength(1);
	expect(execution!.doc.flow.version).toBe(doc.flow.version);
	await patch(`/flows/${flow.id}`, { name: "Changed after start" });
	await put(`/flows/${flow.id}/graph`, {
		nodes: doc.nodes.map((node) => ({ ...node, title: "Changed step" })),
		edges: [],
	});
	await page.reload();
	await page.getByRole("tab", { name: "Flows", exact: true }).click();
	const run = page.getByRole("region", { name: flow.name, exact: true });
	await expect(run.getByText("waiting human", { exact: true })).toBeVisible();
	await expect(run.getByText("Changed step", { exact: true })).toHaveCount(0);
	await run.getByRole("button", { name: "Decide Review the result", exact: true }).click();
	const decision = page.getByRole("dialog", { name: "Decide the flow step", exact: true });
	await expect(decision.getByRole("heading", { name: "Review the result", exact: true })).toBeVisible();
	await expect(decision.getByText("Read the evidence.", { exact: true })).toBeVisible();
	await decision
		.getByRole("textbox", { name: "Decision notes", exact: true })
		.fill("The output meets the acceptance criteria.");
	const release = Promise.withResolvers<void>();
	let decisions = 0;
	await page.route("**/rpc/flowExecutions/decide", async (route) => {
		decisions++;
		await release.promise;
		await route.continue();
	});
	await decision.getByRole("button", { name: "Approve step", exact: true }).click();
	await expect(decision.getByRole("button", { name: "Approve step", exact: true })).toBeDisabled();
	await expect(decision.getByRole("button", { name: "Reject step", exact: true })).toBeDisabled();
	release.resolve();
	await expect(decision).toHaveCount(0);
	expect(decisions).toBe(1);
	await expect(run.getByText("succeeded", { exact: true })).toHaveCount(2);
	await run.getByText("Step output", { exact: true }).click();
	await expect(run.getByText("The output meets the acceptance criteria.", { exact: true })).toBeVisible();
	const [done] = await executions(ticket);
	expect(done!.state.status).toBe("succeeded");
	expect(done!.tasks).toHaveLength(0);
	expect(done!.doc.nodes[0]!.title).toBe("Review the result");
});

for (const action of ["reject", "cancel"] as const) {
	test(`${action} retains the local flow history`, async ({ page }) => {
		const { ticket, flow } = await fixture(`${action} controls`);
		const dialog = await openStart(page, ticket, flow);
		await dialog.getByRole("button", { name: "Start flow", exact: true }).click();
		await expect(dialog).toHaveCount(0);
		const run = page.getByRole("region", { name: flow.name, exact: true });
		if (action === "reject") {
			await run.getByRole("button", { name: "Decide Review the result", exact: true }).click();
			const decision = page.getByRole("dialog", { name: "Decide the flow step", exact: true });
			await decision.getByRole("textbox", { name: "Decision notes", exact: true }).fill("The check is incomplete.");
			await decision.getByRole("button", { name: "Reject step", exact: true }).click();
			await expect(decision).toHaveCount(0);
		} else {
			await run.getByRole("button", { name: "Cancel flow", exact: true }).click();
			const confirmation = page.getByRole("dialog", { name: "Cancel this flow?", exact: true });
			await expect(confirmation).toBeVisible();
			expect((await executions(ticket))[0]!.state.status).toBe("waiting");
			await confirmation.getByRole("button", { name: "Cancel flow", exact: true }).click();
			await expect(confirmation).toHaveCount(0);
		}
		await page.reload();
		await page.getByRole("tab", { name: "Flows", exact: true }).click();
		await expect(run.getByText(action === "reject" ? "failed" : "canceled", { exact: true })).toHaveCount(2);
		await expect(run.getByRole("button", { name: "Decide Review the result", exact: true })).toHaveCount(0);
		await expect(run.getByRole("button", { name: "Cancel flow", exact: true })).toHaveCount(0);
		const history = await executions(ticket);
		expect(history).toHaveLength(1);
		expect(history[0]!.tasks).toHaveLength(0);
		if (action === "reject") expect(history[0]!.state.steps[0]!.output).toBe("The check is incomplete.");
	});
}

test("a human decision shows completed output from the frozen execution", async ({ page }) => {
	const { ticket, flow, doc } = await fixture("Decision context");
	const preceding = { ...doc.nodes[0]!, id: ulid(), title: "Record the evidence" };
	const saved = await put<FlowDoc>(`/flows/${flow.id}/graph`, {
		nodes: [preceding, ...doc.nodes],
		edges: [{ id: ulid(), fromNodeId: preceding.id, toNodeId: doc.nodes[0]!.id, branch: "out" }],
	});
	const started = await post<FlowExecutionRecord>("/flow-executions", {
		flow: flow.id,
		ticket: ticket.identifier,
		defaultPersonaId: persona.id,
		expectedVersion: saved.flow.version,
		requestId: crypto.randomUUID(),
	});
	await post(`/flow-executions/${started.id}/decision`, {
		key: started.state.steps.find((step) => step.nodeId === preceding.id)!.actionKey,
		approved: true,
		output: "Five checks pass. The artifact matches the check.",
		expectedRevision: started.revision,
	});
	await signIn(page, `/t/${ticket.identifier}`);
	await page.getByRole("tab", { name: "Flows", exact: true }).click();
	await page.getByRole("button", { name: "Decide Review the result", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Decide the flow step", exact: true });
	await expect(dialog.getByRole("heading", { name: "Review the result", exact: true })).toBeVisible();
	await expect(dialog.getByText("Read the evidence.", { exact: true })).toBeVisible();
	await expect(dialog.getByText("Record the evidence", { exact: true })).toBeVisible();
	await expect(dialog.getByText("Five checks pass. The artifact matches the check.", { exact: true })).toBeVisible();
	await dialog.getByRole("button", { name: "Approve step", exact: true }).click();
	await expect(dialog).toHaveCount(0);
});

for (const replaced of [false, true]) {
	test(`a flow terminal ${replaced ? "rejects a replaced attempt" : "opens its task attempt"}`, async ({
		page,
	}, testInfo) => {
		const { ticket, flow, doc } = await fixture(`Terminal identity ${replaced}`);
		const started = await post<FlowExecutionRecord>("/flow-executions", {
			flow: flow.id,
			ticket: ticket.identifier,
			defaultPersonaId: persona.id,
			expectedVersion: doc.flow.version,
			requestId: crypto.randomUUID(),
		});
		const runId = ulid();
		const attemptId = crypto.randomUUID();
		started.tasks = [{ key: started.state.steps[0]!.actionKey, runId, attemptId, resultId: null }];
		await page.route("**/rpc/flowExecutions/list*", (route) => route.fulfill({ json: { json: [started] } }));
		await page.route("**/rpc/agentRuns/list*", (route) =>
			route.fulfill({
				json: {
					json: [
						{
							id: runId,
							name: "Task worker",
							runtime: "native",
							terminalId: replaced ? crypto.randomUUID() : attemptId,
							sessionId: null,
							state: "running",
						},
					],
				},
			}),
		);
		const terminalRequests: string[] = [];
		await page.route(`**/api/agent-runs/${runId}/terminal/stream?*`, async (route) => {
			terminalRequests.push(new URL(route.request().url()).searchParams.get("attemptId")!);
			const output = "The matching task terminal\r\n";
			await route.fulfill({
				contentType: "text/event-stream",
				body: `event: session\ndata: ${JSON.stringify({ session: { status: "exited", controllable: false } })}\n\nevent: output\ndata: ${JSON.stringify({ data: btoa(output), startOffset: 0, nextOffset: output.length, truncated: false })}\n\n`,
			});
		});
		await signIn(page, `/t/${ticket.identifier}`);
		await page.getByRole("tab", { name: "Flows", exact: true }).click();
		await page.getByRole("button", { name: "Open terminal for Review the result", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "Flow task terminal", exact: true });
		if (replaced) {
			await expect(
				dialog.getByText("This task's terminal is no longer attached to this assignment.", { exact: true }),
			).toBeVisible();
			expect(terminalRequests).toHaveLength(0);
		} else {
			await expect(dialog.locator(".xterm-accessibility-tree")).toContainText("The matching task terminal");
			expect(terminalRequests).toEqual([attemptId]);
			await expect(dialog.getByRole("button", { name: "Close terminal", exact: true })).toBeFocused();
			await page.screenshot({ path: testInfo.outputPath("flow-task-terminal.png") });
		}
	});
}
