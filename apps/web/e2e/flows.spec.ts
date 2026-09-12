import { expect, test } from "@playwright/test";
import type { Flow, FlowDoc } from "@trellis/api";
import { get, post, put } from "./api";
import { signIn } from "./support";

test.beforeAll(async () => {
	await post("/projects", { name: "Flow tests", key: "FLOW" });
});

const create = () => post<Flow>("/flows", { name: `Draft ${crypto.randomUUID()}` });
const read = (flow: Flow) => get<FlowDoc>(`/flows/${flow.id}`);

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
