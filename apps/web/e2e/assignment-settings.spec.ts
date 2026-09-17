import { expect, test } from "@playwright/test";
import type { Persona, Project, Ticket } from "@trellis/api";
import { get, patch, post, statusOf } from "./api";
import { cardOf, columnOf, signIn } from "./support";

test("assignment confirms the persona, harness, model, and effort before launch", async ({ page }) => {
	const persona = await post<Persona>("/personas", {
		name: "Assignment builder",
		kind: "builder",
		instruction: "Wait.",
	});
	await post("/projects", { key: "ASG", name: "Assignment form" });
	const ticket = await post<Ticket>("/tickets", { project: "ASG", title: "Choose launch configuration" });
	let started: unknown;
	await page.route("**/rpc/agentRuns/start", async (route) => {
		started = route.request().postDataJSON().json;
		await route.fulfill({ json: { json: { state: "running" } } });
	});
	await signIn(page, `/t/${ticket.identifier}`);
	await page.getByRole("button", { name: "Add persona", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Assign an agent", exact: true });
	await expect(dialog).toBeVisible();
	await dialog.getByRole("combobox", { name: "Persona", exact: true }).click();
	await page.getByRole("option", { name: persona.name, exact: true }).click();
	expect(started).toBeUndefined();
	await dialog.getByRole("combobox", { name: "Harness", exact: true }).click();
	await page.getByRole("option", { name: "Codex", exact: true }).click();
	await dialog.getByRole("combobox", { name: "Model", exact: true }).click();
	await page.getByRole("option", { name: "openai/gpt-5.6-sol", exact: true }).click();
	await dialog.getByRole("combobox", { name: "Reasoning effort", exact: true }).click();
	await page.getByRole("option", { name: "High", exact: true }).click();
	await dialog.getByRole("button", { name: "Assign", exact: true }).click();
	await expect(dialog).toBeHidden();
	expect(started).toMatchObject({
		ticket: ticket.identifier,
		personaId: persona.id,
		harness: { preset: "codex", model: "openai/gpt-5.6-sol", effort: "high" },
	});
});

test("project builder defaults survive reload and prefill a child assignment", async ({ page }) => {
	const persona = await post<Persona>("/personas", { name: "Default builder", kind: "builder", instruction: "Wait." });
	await post("/projects", {
		key: "ABD",
		name: "Automatic builder defaults",
		managerConfig: { personaId: null, directory: "" },
	});
	await post("/projects", { parent: "ABD", slug: "child", name: "Child defaults" });
	const ticket = await post<Ticket>("/tickets", { project: "ABD.child", title: "Saved defaults" });
	await signIn(page, "/p/ABD/settings#harness");
	const section = page.getByRole("region", { name: "Automatic builder", exact: true });
	await section.getByRole("combobox", { name: "Persona", exact: true }).click();
	await expect(page.getByRole("option", { name: "Use parent defaults", exact: true })).toBeVisible();
	await expect(page.getByRole("option", { name: "No automatic builder", exact: true })).toHaveCount(0);
	await page.getByRole("option", { name: persona.name, exact: true }).click();
	await section.getByRole("combobox", { name: "Harness", exact: true }).click();
	await page.getByRole("option", { name: "Codex", exact: true }).click();
	await section.getByRole("combobox", { name: "Model", exact: true }).click();
	await page.getByRole("option", { name: "openai/gpt-5.6-sol", exact: true }).click();
	await section.getByRole("combobox", { name: "Reasoning effort", exact: true }).click();
	await page.getByRole("option", { name: "High", exact: true }).click();
	await expect
		.poll(async () => (await get<Project>("/projects/ABD")).managerConfig?.builder)
		.toMatchObject({
			personaId: persona.id,
			harness: { preset: "codex", model: "openai/gpt-5.6-sol", effort: "high" },
		});
	await page.reload();
	await expect(section.getByRole("combobox", { name: "Persona", exact: true })).toContainText(persona.name);
	await expect(section.getByRole("combobox", { name: "Reasoning effort", exact: true })).toContainText("High");
	await page.goto(`/t/${ticket.identifier}`);
	await page.getByRole("button", { name: "Add persona", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Assign an agent", exact: true });
	await expect(dialog.getByRole("combobox", { name: "Persona", exact: true })).toContainText(persona.name);
	await expect(dialog.getByRole("combobox", { name: "Harness", exact: true })).toContainText("Codex");
	await expect(dialog.getByRole("combobox", { name: "Reasoning effort", exact: true })).toContainText("High");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("board WIP limits save and clear from the status menu", async ({ page }) => {
	await post("/projects", { key: "WIP", name: "Board WIP" });
	await signIn(page, "/p/WIP/board");
	await page.getByRole("button", { name: "In Progress actions", exact: true }).click();
	await page.getByRole("menuitem", { name: "Set WIP limit", exact: true }).click();
	const limit = page.getByRole("spinbutton", { name: "WIP limit for In Progress", exact: true });
	await limit.fill("9");
	await limit.press("Enter");
	await expect
		.poll(
			async () =>
				(await get<Project>("/projects/WIP")).statuses.find((status) => status.category === "started")?.wipLimit,
		)
		.toBe(9);
	await page.reload();
	await page.getByRole("button", { name: "In Progress actions", exact: true }).click();
	await page.getByRole("menuitem", { name: "Set WIP limit", exact: true }).click();
	await expect(limit).toHaveValue("9");
	await limit.fill("");
	await limit.press("Enter");
	await expect
		.poll(
			async () =>
				(await get<Project>("/projects/WIP")).statuses.find((status) => status.category === "started")?.wipLimit,
		)
		.toBeNull();
});

test("unsupported effort stays hidden and the assignment fits phone widths", async ({ page }) => {
	await post("/projects", { key: "AEF", name: "Assignment effort" });
	const ticket = await post<Ticket>("/tickets", { project: "AEF", title: "Choose a supported effort" });
	await signIn(page, `/t/${ticket.identifier}`);
	await page.getByRole("button", { name: "Add persona", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Assign an agent", exact: true });
	await dialog.getByRole("combobox", { name: "Model", exact: true }).click();
	await page.getByRole("option", { name: "anthropic/claude-haiku-4.5", exact: true }).click();
	await expect(dialog.getByRole("combobox", { name: /Effort|Reasoning effort|Thinking level|Variant/ })).toHaveCount(0);
	await dialog.getByRole("combobox", { name: "Harness", exact: true }).click();
	await page.getByRole("option", { name: "Codex", exact: true }).click();
	await expect(dialog.getByRole("combobox", { name: "Reasoning effort", exact: true })).toContainText(
		"Harness default",
	);
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	for (const width of [320, 390]) {
		await page.setViewportSize({ width, height: 844 });
		await page.getByRole("button", { name: "Add persona", exact: true }).click();
		await expect(dialog).toBeVisible();
		expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
		const bounds = await dialog.boundingBox();
		expect(bounds!.x).toBeGreaterThanOrEqual(0);
		expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
		await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	}
	await expect(dialog).toBeHidden();
});

test.describe("required builder defaults", () => {
	let ticketId: string | undefined;
	test.afterEach(async () => {
		if (ticketId) await patch(`/tickets/${ticketId}`, { status: "todo" });
		await post("/native-work/resume", {});
	});
	test("a board move requires a builder and succeeds after project settings save one", async ({ page }) => {
		await post("/native-work/stop", {});
		const persona = await post<Persona>("/personas", {
			name: "Required builder",
			kind: "builder",
			instruction: "Wait.",
		});
		await post("/projects", { key: "ABG", name: "Required builder defaults" });
		const ticket = await post<Ticket>("/tickets", { project: "ABG", title: "Require builder before work" });
		ticketId = ticket.identifier;
		await signIn(page, "/p/ABG/board");
		await cardOf(page, ticket.identifier).focus();
		await cardOf(page, ticket.identifier).press("]");
		await expect(page.locator("[data-sonner-toast]").filter({ hasText: /builder/i })).toBeVisible();
		await expect(cardOf(columnOf(page, "Todo"), ticket.identifier)).toBeVisible();
		expect(await statusOf(ticket.identifier)).toBe("Todo");
		await page.goto("/p/ABG/settings#harness");
		const section = page.getByRole("region", { name: "Automatic builder", exact: true });
		await expect(
			section.getByText("Select a builder before a ticket enters In Progress.", { exact: true }),
		).toBeVisible();
		await section.getByRole("combobox", { name: "Persona", exact: true }).click();
		await expect(page.getByRole("option", { name: "No automatic builder", exact: true })).toHaveCount(0);
		await page.getByRole("option", { name: persona.name, exact: true }).click();
		await expect
			.poll(async () => (await get<Project>("/projects/ABG")).managerConfig?.builder?.personaId)
			.toBe(persona.id);
		await page.goto("/p/ABG/board");
		await cardOf(page, ticket.identifier).focus();
		await cardOf(page, ticket.identifier).press("]");
		await expect(cardOf(columnOf(page, "In Progress"), ticket.identifier)).toBeVisible();
		await expect.poll(() => statusOf(ticket.identifier)).toBe("In Progress");
	});
});
