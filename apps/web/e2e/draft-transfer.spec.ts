import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Flow, FlowDoc, FlowNode } from "@trellis/api";
import { ulid } from "ulid";
import { get, post } from "./api";
import { signIn } from "./support";

test.beforeAll(async () => {
	await post("/projects", { name: "Draft transfer tests", key: "DRAFTS" });
});

const bundle = (entries: { area: string; key: string; value: string }[]) =>
	Buffer.from(JSON.stringify({ format: "trellis-drafts", version: 1, exportedAt: new Date().toISOString(), entries }));
const copies = () =>
	Object.keys(localStorage)
		.filter((key) => key.startsWith("trellis.draft-transfer.copy."))
		.map((key) => JSON.parse(localStorage.getItem(key)!));

test("Settings exports drafts and preserves conflicting review copies on import", async ({ page }) => {
	await signIn(page, "/settings#drafts");
	await page.evaluate(() => {
		localStorage.setItem("trellis.review.summary:fake/pr/1", "Existing draft");
		localStorage.setItem("trellis.token", "must-not-export");
		sessionStorage.setItem("trellis-composer-draft", JSON.stringify({ title: "Unsent ticket", description: "Body" }));
	});
	const download = page.waitForEvent("download");
	await page.getByRole("button", { name: "Export drafts", exact: true }).click();
	const file = await download;
	const exported = await readFile((await file.path())!, "utf8");
	expect(JSON.parse(exported).entries).toHaveLength(2);
	expect(exported).not.toContain("must-not-export");
	const input = page.getByLabel("Draft file", { exact: true });
	await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{") });
	await expect(page.getByRole("alert")).toBeVisible();
	expect(await page.evaluate(copies)).toEqual([]);
	await input.setInputFiles({
		name: "drafts.json",
		mimeType: "application/json",
		buffer: bundle([{ area: "local", key: "trellis.review.summary:fake/pr/1", value: "Imported draft" }]),
	});
	const dialog = page.getByRole("dialog", { name: "Draft recovery copies", exact: true });
	await expect(dialog).toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem("trellis.review.summary:fake/pr/1"))).toBe("Existing draft");
	await dialog.getByRole("button", { name: "Restore draft", exact: true }).click();
	expect(await page.evaluate(() => localStorage.getItem("trellis.review.summary:fake/pr/1"))).toBe("Imported draft");
	expect(await page.evaluate(copies)).toHaveLength(2);
	await dialog.getByRole("button", { name: "Remove copy", exact: true }).click();
	await page
		.getByRole("dialog", { name: "Remove this recovery copy?", exact: true })
		.getByRole("button", { name: "Remove copy", exact: true })
		.click();
	expect((await page.evaluate(copies))[0].entry.value).toBe("Existing draft");
});

test("a new tab selects imported flow drafts and retains each until a confirmed save", async ({ page }) => {
	const flow = await post<Flow>("/flows", { name: `Transfer ${crypto.randomUUID()}` });
	const node: FlowNode = {
		id: ulid(),
		parentId: null,
		kind: "agent",
		title: "First imported draft",
		personaId: null,
		instruction: "Read the test fixture.",
		parallel: false,
		minutes: null,
		maxRounds: null,
		x: 0,
		y: 0,
		width: null,
		height: null,
	};
	await signIn(page, "/settings#drafts");
	await page.getByLabel("Draft file", { exact: true }).setInputFiles({
		name: "flow-drafts.json",
		mimeType: "application/json",
		buffer: bundle(
			[node, { ...node, title: "Second imported draft" }].map((item) => ({
				area: "local",
				key: `trellis.flow-draft.browser-tab.${flow.id}`,
				value: JSON.stringify({ version: flow.version, graph: { nodes: [item], edges: [] } }),
			})),
		),
	});
	await page
		.getByRole("dialog", { name: "Draft recovery copies", exact: true })
		.getByRole("button", { name: "Open flow", exact: true })
		.click();
	const picker = page.getByRole("dialog", { name: "Recover an imported flow draft", exact: true });
	await expect(picker).toBeVisible();
	await picker.getByRole("combobox", { name: "Imported flow draft", exact: true }).click();
	await page.getByRole("option", { name: /^Draft 2:/ }).click();
	const release = Promise.withResolvers<void>();
	let requests = 0;
	await page.route("**/rpc/flows/save", async (route) => {
		requests++;
		await release.promise;
		await route.continue();
	});
	await picker.getByRole("button", { name: "Open draft", exact: true }).click();
	await expect(page.getByText("Second imported draft", { exact: true })).toBeVisible();
	await expect.poll(() => requests).toBe(1);
	expect(await page.evaluate(copies)).toHaveLength(2);
	release.resolve();
	await expect.poll(async () => (await page.evaluate(copies)).length).toBe(1);
	expect((await get<FlowDoc>(`/flows/${flow.id}`)).nodes[0]?.title).toBe("Second imported draft");
	await page.getByRole("button", { name: "Recover imported draft", exact: true }).click();
	await picker.getByRole("button", { name: "Open draft", exact: true }).click();
	await expect(page.getByText("Draft kept: the flow changed in another window", { exact: true })).toBeVisible();
	expect(await page.evaluate(copies)).toHaveLength(1);
	await page.reload();
	await expect(picker).toBeVisible();
	expect(await page.evaluate(copies)).toHaveLength(1);
});

test("the picker retains a selected copy when the server already has its graph", async ({ page }) => {
	const flow = await post<Flow>("/flows", { name: `Acknowledged ${crypto.randomUUID()}` });
	await signIn(page, "/settings#drafts");
	const value = JSON.stringify({ version: flow.version, graph: { nodes: [], edges: [] } });
	await page.getByLabel("Draft file", { exact: true }).setInputFiles({
		name: "saved-draft.json",
		mimeType: "application/json",
		buffer: bundle([{ area: "local", key: `trellis.flow-draft.old-tab.${flow.id}`, value }]),
	});
	await page.evaluate(
		({ id, value }) => {
			const key = Object.keys(localStorage).find((key) => key.startsWith("trellis.draft-transfer.copy."))!;
			const copy = JSON.parse(localStorage.getItem(key)!);
			sessionStorage.setItem("trellis.flow-tab", "reopened-tab");
			localStorage.setItem(`trellis.flow-draft.reopened-tab.${id}`, value);
			localStorage.setItem(`trellis.flow-import-selection.reopened-tab.${id}`, copy.id);
		},
		{ id: flow.id, value },
	);
	await page
		.getByRole("dialog", { name: "Draft recovery copies", exact: true })
		.getByRole("button", { name: "Open flow", exact: true })
		.click();
	const picker = page.getByRole("dialog", { name: "Recover an imported flow draft", exact: true });
	await expect(picker.getByText("Empty graph", { exact: true })).toBeVisible();
	expect(await page.evaluate(copies)).toHaveLength(1);
	await picker.getByRole("button", { name: "Open draft", exact: true }).click();
	await expect(picker).toHaveCount(0);
	await expect.poll(async () => (await page.evaluate(copies)).length).toBe(0);
	await expect(page.getByRole("region", { name: "Flow canvas", exact: true })).toBeVisible();
});
