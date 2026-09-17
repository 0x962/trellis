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

// The composer takes the focus into the title box while the browser still
// holds the same `c` press. The hotkey handler cancels that press, so the
// browser writes no character. The test types after the composer opens,
// because a stray `c` lands in front of the typed text.
test("the c that opens the composer stays out of the title", async ({ page }) => {
	await signIn(page, "/p/CRT/table");
	await expect(page.getByRole("heading", { name: "Create", level: 1 })).toBeVisible();
	await page.keyboard.press("c");
	const composer = page.getByRole("dialog", { name: "New ticket" });
	await expect(composer).toBeVisible();
	const title = composer.getByRole("textbox", { name: "Title" });
	await expect(title).toBeFocused();
	await expect(title).toHaveValue("");
	await page.keyboard.type("Check the invoice export");
	await expect(title).toHaveValue("Check the invoice export");
});
