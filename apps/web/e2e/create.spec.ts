import { expect, test } from "@playwright/test";
import { get } from "./api";
import { ensureProject } from "./cli";
import { rowOf, signIn } from "./support";

test.beforeAll(() => {
	ensureProject("CRT", "Create");
});

// The composer opens on `c`, takes the project from the route, and creates
// on Cmd+Enter. The new row shows in the table without a reload.
test("the composer creates a ticket with Cmd+Enter and the row joins the table", async ({ page }) => {
	await signIn(page, "/p/CRT/table");
	await expect(page.getByRole("heading", { name: "Create", level: 1 })).toBeVisible();
	const title = `Write the release notes ${Date.now()}`;
	await page.keyboard.press("c");
	const composer = page.getByRole("dialog", { name: "New ticket" });
	await expect(composer).toBeVisible();
	await composer.getByRole("textbox", { name: "Title" }).fill(title);
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(composer).toBeHidden();
	const list = await get<{ items: { identifier: string; title: string }[] }>("/tickets?project=CRT");
	const created = list.items.find((item) => item.title === title)!;
	expect(created.identifier).toMatch(/^CRT-\d+$/);
	await expect(rowOf(page, created.identifier)).toContainText(title);
});

// A file picked in the composer has no ticket to belong to yet. It waits in
// the browser, and it uploads after the create answers, so the new ticket
// carries it.
test("the composer attaches a file that was picked before the ticket existed", async ({ page }) => {
	await signIn(page, "/p/CRT/table");
	await expect(page.getByRole("heading", { name: "Create", level: 1 })).toBeVisible();
	const title = `Attach the spec ${Date.now()}`;
	await page.keyboard.press("c");
	const composer = page.getByRole("dialog", { name: "New ticket" });
	await expect(composer).toBeVisible();
	await composer.getByRole("textbox", { name: "Title" }).fill(title);
	await composer.getByLabel("Choose files").setInputFiles({
		name: "spec.txt",
		mimeType: "text/plain",
		buffer: Buffer.from("the spec"),
	});
	await expect(composer.getByText("spec.txt")).toBeVisible();
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(composer).toBeHidden();
	const list = await get<{ items: { identifier: string; title: string }[] }>("/tickets?project=CRT");
	const created = list.items.find((item) => item.title === title)!;
	await page.goto(`/t/${created.identifier}`);
	await expect(page.getByRole("link", { name: "Download spec.txt" })).toBeVisible();
});
