import { expect, test } from "@playwright/test";
import type { Flow, FlowDoc } from "@trellis/api";
import { get, post, put } from "./api";
import { signIn } from "./support";

test.beforeAll(async () => {
	await post("/projects", { name: "Flow tests", key: "FLOW" });
});

const create = () => post<Flow>("/flows", { name: `Draft ${crypto.randomUUID()}` });
const read = (flow: Flow) => get<FlowDoc>(`/flows/${flow.id}`);

test("flow settings save and cancel through the shared footer", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.getByRole("button", { name: "Flow settings", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "Flow settings", exact: true });
	await sheet.getByRole("textbox", { name: "Description", exact: true }).fill("Saved description");
	await sheet.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect(sheet).toHaveCount(0);
	expect((await read(flow)).flow.description).toBe("Saved description");
	await page.getByRole("button", { name: "Flow settings", exact: true }).click();
	await sheet.getByRole("textbox", { name: "Description", exact: true }).fill("Discard this");
	await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(sheet).toHaveCount(0);
	expect((await read(flow)).flow.description).toBe("Saved description");
});

test("persona edits save and cancel through the shared footer", async ({ page }) => {
	const name = `Persona ${crypto.randomUUID()}`;
	await post("/personas", { name, kind: "reviewer", instruction: "Read the diff." });
	await signIn(page, "/ai/personas");
	const card = page.getByRole("article", { name, exact: true });
	await card.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "Edit persona", exact: true });
	await sheet.getByRole("textbox", { name: "Instruction", exact: true }).fill("Review the change.");
	await sheet.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect(sheet).toHaveCount(0);
	await expect(card).toContainText("Review the change.");
	await card.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
	await sheet.getByRole("textbox", { name: "Instruction", exact: true }).fill("Discard this");
	await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(sheet).toHaveCount(0);
	await expect(card).toContainText("Review the change.");
});

test("the entire flow card opens its graph and supports keyboard navigation", async ({ page }) => {
	const flow = await create();
	await signIn(page, "/ai/flows");
	const card = page.getByRole("article", { name: flow.name, exact: true });
	const bounds = await card.boundingBox();
	await card.click({ position: { x: 12, y: bounds!.height - 12 } });
	await expect(page).toHaveURL(new RegExp(`/ai/flows/${flow.slug}$`));
	await page.goto("/ai/flows");
	await card.getByRole("link", { name: flow.name, exact: true }).focus();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(new RegExp(`/ai/flows/${flow.slug}$`));
});

test("group captions show only the name and enabled options", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.getByRole("button", { name: "Add group", exact: true }).click();
	await page.getByRole("textbox", { name: "Title", exact: true }).fill("New budget");
	const caption = page.getByRole("region", { name: "Flow canvas" }).locator("header");
	await expect(caption).toHaveText("");
	await page.getByRole("switch", { name: "Parallel", exact: true }).click();
	await expect(caption).toHaveText("Parallel");
	await page.getByRole("switch", { name: "Time limit", exact: true }).click();
	await expect(caption).toHaveText("Parallel · 10 min");
	await page.getByRole("switch", { name: "Parallel", exact: true }).click();
	await expect(caption).toHaveText("10 min");
	await page.getByRole("textbox", { name: "Title", exact: true }).fill("Backend checks");
	await expect(caption).toHaveText("Backend checks10 min");
});

test("palette tooltips use the panel theme and appear without a hover delay", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	for (const kind of ["agent", "gate", "human", "group", "loop"]) {
		await page.getByRole("button", { name: `Add ${kind}`, exact: true }).hover();
		const tooltip = page.getByRole("tooltip");
		await expect(tooltip).toBeVisible({ timeout: 200 });
		await expect(tooltip).toHaveClass(/bg-elevated/);
		await expect(tooltip).toContainText(new RegExp(kind, "i"));
		await page.getByRole("heading", { name: flow.name, exact: true }).hover();
		await expect(tooltip).toHaveCount(0);
	}
});

test("the node sheet labels its sections and closes without losing edits", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.getByRole("button", { name: "Add agent", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "Edit agent", exact: true });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByRole("heading", { name: "Details", exact: true })).toBeVisible();
	await expect(sheet.getByRole("heading", { name: "Instructions", exact: true })).toBeVisible();
	await sheet.getByRole("button", { name: "Persona", exact: true }).click();
	await expect(page.getByRole("combobox", { name: "Search personas", exact: true })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog", { name: "Select a persona", exact: true })).toHaveCount(0);
	await expect(sheet).toBeVisible();
	await sheet.getByRole("textbox", { name: "Title", exact: true }).fill("Review the change");
	await sheet.getByRole("textbox", { name: "Instruction", exact: true }).fill("Read the diff.");
	await sheet.getByRole("button", { name: "Close", exact: true }).click();
	await expect(sheet).toHaveCount(0);
	await expect.poll(async () => (await read(flow)).nodes[0]?.instruction).toBe("Read the diff.");
	await page.getByText("Review the change", { exact: true }).click();
	await expect(sheet.getByRole("textbox", { name: "Instruction", exact: true })).toHaveValue("Read the diff.");
	await page.keyboard.press("Escape");
	await expect(sheet).toHaveCount(0);
	await page.getByText("Review the change", { exact: true }).click();
	await sheet.getByRole("button", { name: "Done", exact: true }).click();
	await expect(sheet).toHaveCount(0);
});

test("the node sheet fits a phone and keeps its close control visible", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.getByRole("button", { name: "Add agent", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "Edit agent", exact: true });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByRole("textbox", { name: "Instruction", exact: true })).toBeVisible();
	await expect(sheet.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
	const bounds = await sheet.boundingBox();
	expect(bounds!.x).toBeGreaterThanOrEqual(0);
	expect(bounds!.width).toBeLessThanOrEqual(390);
	await page.screenshot({ path: "/tmp/trellis-flow-polish-mobile.png" });
	await sheet.getByRole("button", { name: "Close", exact: true }).click();
	await expect(sheet).toHaveCount(0);
});

test("unfinished steps save to the server and survive a reload", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.getByRole("button", { name: "Add agent", exact: true }).click();
	await page.getByRole("textbox", { name: "Title", exact: true }).fill("Unfinished review");
	await expect.poll(async () => (await read(flow)).nodes[0]?.title).toBe("Unfinished review");
	await expect(page.getByRole("status").filter({ hasText: "Saved" })).toContainText("1 issue");
	await page.reload();
	await expect(page.getByText("Unfinished review", { exact: true })).toBeVisible();
	expect((await read(flow)).nodes[0]?.instruction).toBe("");
});

test("unused gate and group connectors appear on hover and keyboard focus", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	for (const kind of ["gate", "group"]) {
		await page.getByRole("button", { name: `Add ${kind}`, exact: true }).click();
		await page.getByRole("button", { name: "Close", exact: true }).click();
		const node = page.locator(kind === "gate" ? ".react-flow__node-step" : ".react-flow__node-box").first();
		const handle = node.locator(kind === "gate" ? '[data-handleid="no-right"]' : '[data-handleid="out-right"]');
		await page.getByRole("heading", { name: flow.name, exact: true }).hover();
		await expect(handle).toHaveCSS("opacity", "0");
		await (kind === "group" ? node.locator("header") : node).hover();
		await expect(handle).toHaveCSS("opacity", "1");
		await page.getByRole("heading", { name: flow.name, exact: true }).hover();
		await expect(handle).toHaveCSS("opacity", "0");
		await node.focus();
		await expect(handle).toHaveCSS("opacity", "1");
		await page.getByRole("heading", { name: flow.name, exact: true }).click();
	}
	await expect(page.locator(".flow-edge-anchor")).toBeVisible();
});

test("navigation before autosave restores the pending draft", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.getByRole("button", { name: "Add agent", exact: true }).click();
	await page.getByRole("textbox", { name: "Title", exact: true }).fill("Pending review");
	await page.getByRole("link", { name: "Flows", exact: true }).first().click();
	await page.goto(`/ai/flows/${flow.slug}`);
	await expect(page.getByText("Pending review", { exact: true })).toBeVisible();
	await expect.poll(async () => (await read(flow)).nodes[0]?.title).toBe("Pending review");
});

test("a failed save keeps the draft through a reload", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.route("**/rpc/flows/save", (route) => route.abort());
	await page.getByRole("button", { name: "Add agent", exact: true }).click();
	await page.getByRole("textbox", { name: "Title", exact: true }).fill("Keep after network failure");
	await expect(page.getByRole("status").filter({ hasText: "the save failed" })).toBeVisible();
	await page.reload();
	await expect(page.getByText("Keep after network failure", { exact: true })).toBeVisible();
	await expect(page.getByRole("status").filter({ hasText: "the save failed" })).toBeVisible();
	await page.unroute("**/rpc/flows/save");
	await page.getByRole("button", { name: "Retry the save" }).click();
	await expect.poll(async () => (await read(flow)).nodes[0]?.title).toBe("Keep after network failure");
});

test("a group stores parallel mode and an optional time limit", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.getByRole("button", { name: "Add group", exact: true }).click();
	await page.getByRole("switch", { name: "Parallel", exact: true }).click();
	await page.getByRole("switch", { name: "Time limit", exact: true }).click();
	await page.getByRole("spinbutton", { name: "Minutes" }).fill("12");
	await expect
		.poll(async () => (await read(flow)).nodes.find((node) => node.kind === "group"))
		.toMatchObject({ parallel: true, minutes: 12 });
	await page.getByRole("button", { name: "Add agent", exact: true }).click();
	await expect.poll(async () => (await read(flow)).nodes.length).toBe(3);
	expect((await read(flow)).edges).toEqual([]);
	await page.reload();
	await expect(page.getByText("Parallel · 12 min", { exact: true })).toBeVisible();
	await page.getByText("Parallel · 12 min", { exact: true }).click();
	await page.getByRole("switch", { name: "Parallel", exact: true }).click();
	await page.getByRole("switch", { name: "Time limit", exact: true }).click();
	await expect
		.poll(async () => (await read(flow)).nodes.find((node) => node.kind === "group"))
		.toMatchObject({ parallel: false, minutes: null });
	await expect(page.getByRole("alert")).toHaveText(
		"A connected group needs one starting step. Connect every other child from that step.",
	);
});

test("a version conflict keeps the draft through a reload and requires consent to discard", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.getByRole("button", { name: "Add agent", exact: true }).click();
	await expect.poll(async () => (await read(flow)).nodes.length).toBe(1);
	const saved = await read(flow);
	await put(`/flows/${flow.id}/graph`, {
		nodes: [{ ...saved.nodes[0], title: "Server edit" }],
		edges: [],
		expectedVersion: saved.flow.version,
	});
	await page.getByRole("textbox", { name: "Title", exact: true }).fill("My browser edit");
	await expect(page.getByRole("status").filter({ hasText: "another window" })).toBeVisible();
	await page.reload();
	await expect(page.getByText("My browser edit", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Reload the flow" }).click();
	await expect(page.getByRole("dialog", { name: "Discard this draft?" })).toBeVisible();
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(page.getByText("My browser edit", { exact: true })).toBeVisible();
	expect((await read(flow)).nodes[0]?.title).toBe("Server edit");
});
