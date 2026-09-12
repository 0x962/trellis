import { expect, test } from "@playwright/test";
import type { Flow, FlowDoc } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

test.beforeAll(async () => {
	await post("/projects", { name: "Explicit save tests", key: "FSAVE" });
});

const create = () => post<Flow>("/flows", { name: `Save ${crypto.randomUUID()}` });
const read = (flow: Flow) => get<FlowDoc>(`/flows/${flow.id}`);

test("Save sends pending edits immediately and keeps the sheet open until the server confirms", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.getByRole("button", { name: "Add agent", exact: true }).click();
	await expect.poll(async () => (await read(flow)).nodes.length).toBe(1);
	const release = Promise.withResolvers<void>();
	let requests = 0;
	await page.route("**/rpc/flows/save", async (route) => {
		requests++;
		await release.promise;
		await route.continue();
	});
	const sheet = page.getByRole("dialog", { name: "Edit agent", exact: true });
	await sheet.getByRole("textbox", { name: "Title", exact: true }).fill("Save this edit");
	await sheet.getByRole("button", { name: "Save", exact: true }).click();
	await expect.poll(() => requests, { timeout: 400 }).toBe(1);
	await expect(sheet).toBeVisible();
	await expect(sheet.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
	release.resolve();
	await expect(sheet).toHaveCount(0);
	expect((await read(flow)).nodes[0]?.title).toBe("Save this edit");
});

test("Save waits for autosave and then saves edits made during that request", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.getByRole("button", { name: "Add agent", exact: true }).click();
	await expect.poll(async () => (await read(flow)).nodes.length).toBe(1);
	const release = Promise.withResolvers<void>();
	let requests = 0;
	await page.route("**/rpc/flows/save", async (route) => {
		requests++;
		if (requests === 1) await release.promise;
		await route.continue();
	});
	const sheet = page.getByRole("dialog", { name: "Edit agent", exact: true });
	await sheet.getByRole("textbox", { name: "Title", exact: true }).fill("First edit");
	await expect.poll(() => requests).toBe(1);
	await sheet.getByRole("textbox", { name: "Instruction", exact: true }).fill("Latest edit");
	await sheet.getByRole("button", { name: "Save", exact: true }).click();
	release.resolve();
	await expect(sheet).toHaveCount(0);
	expect(requests).toBe(2);
	expect((await read(flow)).nodes[0]?.instruction).toBe("Latest edit");
});

test("a refused Save keeps the node sheet open and permits another save", async ({ page }) => {
	const flow = await create();
	await signIn(page, `/ai/flows/${flow.slug}`);
	await page.getByRole("button", { name: "Add agent", exact: true }).click();
	await expect.poll(async () => (await read(flow)).nodes.length).toBe(1);
	await page.route("**/rpc/flows/save", (route) => route.abort());
	const sheet = page.getByRole("dialog", { name: "Edit agent", exact: true });
	await sheet.getByRole("textbox", { name: "Title", exact: true }).fill("Keep this edit");
	await sheet.getByRole("button", { name: "Save", exact: true }).click();
	await expect(sheet.getByRole("alert")).toBeVisible();
	await expect(sheet.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
	await expect(sheet.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Keep this edit");
	await page.unroute("**/rpc/flows/save");
	await sheet.getByRole("button", { name: "Save", exact: true }).click();
	await expect(sheet).toHaveCount(0);
	expect((await read(flow)).nodes[0]?.title).toBe("Keep this edit");
});
