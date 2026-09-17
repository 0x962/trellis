import { expect, test } from "@playwright/test";
import { get } from "./api";
import { ensureProject } from "./cli";
import { dropFiles, rowOf, signIn, toastOf } from "./support";

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

test("the composer keeps a selected attachment through edits and uploads it after the ticket", async ({ page }) => {
	await signIn(page, "/p/CRT/table");
	await page.keyboard.press("c");
	const composer = page.getByRole("dialog", { name: "New ticket" });
	const chooser = page.waitForEvent("filechooser");
	await composer.getByRole("button", { name: "Add", exact: true }).click();
	await (await chooser).setFiles({ name: "brief.txt", mimeType: "text/plain", buffer: Buffer.from("release brief") });
	await expect(composer.getByText("brief.txt", { exact: true })).toBeVisible();
	const title = `Attach the release brief ${Date.now()}`;
	await composer.getByRole("textbox", { name: "Title" }).fill("Draft title");
	await composer.getByRole("textbox", { name: "Title" }).fill(title);
	await composer.getByRole("button", { name: "Create", exact: true }).click();
	await expect(composer).toBeHidden();
	const list = await get<{ items: { identifier: string; title: string }[] }>("/tickets?project=CRT");
	const created = list.items.find((item) => item.title === title)!;
	const ticket = await get<{ attachments: { filename: string }[] }>(`/tickets/${created.identifier}`);
	expect(ticket.attachments.map((attachment) => attachment.filename)).toContain("brief.txt");
});

test("the composer accepts a dropped attachment", async ({ page }) => {
	await signIn(page, "/p/CRT/table");
	await page.keyboard.press("c");
	const composer = page.getByRole("dialog", { name: "New ticket" });
	const target = composer.getByRole("region", { name: "Attachments for new ticket" });
	await dropFiles(page, target, [{ name: "drop.txt", type: "text/plain", text: "drop body" }]);
	await expect(composer.getByText("drop.txt", { exact: true })).toBeVisible();
	const title = `Keep the dropped file ${Date.now()}`;
	await composer.getByRole("textbox", { name: "Title" }).fill(title);
	await composer.getByRole("button", { name: "Create", exact: true }).click();
	await expect(composer).toBeHidden();
	const list = await get<{ items: { identifier: string; title: string }[] }>("/tickets?project=CRT");
	const created = list.items.find((item) => item.title === title)!;
	const ticket = await get<{ attachments: { filename: string }[] }>(`/tickets/${created.identifier}`);
	expect(ticket.attachments.map((attachment) => attachment.filename)).toContain("drop.txt");
});

test("discarding the composer does not upload its selected attachment", async ({ page }) => {
	let uploadRequests = 0;
	page.on("request", (request) => {
		if (request.url().includes("/rpc/attachments/upload")) uploadRequests += 1;
	});
	await signIn(page, "/p/CRT/table");
	await page.keyboard.press("c");
	const composer = page.getByRole("dialog", { name: "New ticket" });
	const chooser = page.waitForEvent("filechooser");
	await composer.getByRole("button", { name: "Add", exact: true }).click();
	await (await chooser).setFiles({ name: "discard.txt", mimeType: "text/plain", buffer: Buffer.from("discard") });
	await page.keyboard.press("Escape");
	await page.getByRole("dialog", { name: "Discard the draft?" }).getByRole("button", { name: "Discard" }).click();
	await expect(composer).toBeHidden();
	expect(uploadRequests).toBe(0);
});

test("a failed ticket create keeps the selected attachment and does not upload it", async ({ page }) => {
	let uploadRequests = 0;
	page.on("request", (request) => {
		if (request.url().includes("/rpc/attachments/upload")) uploadRequests += 1;
	});
	await page.route("**/rpc/tickets/create", (route) => route.abort());
	await signIn(page, "/p/CRT/table");
	await page.keyboard.press("c");
	const composer = page.getByRole("dialog", { name: "New ticket" });
	const chooser = page.waitForEvent("filechooser");
	await composer.getByRole("button", { name: "Add", exact: true }).click();
	await (await chooser).setFiles({ name: "retry.txt", mimeType: "text/plain", buffer: Buffer.from("retry") });
	await composer.getByRole("textbox", { name: "Title" }).fill(`Fail the create ${Date.now()}`);
	await composer.getByRole("button", { name: "Create", exact: true }).click();
	await expect(toastOf(page, "The ticket did not save.")).toBeVisible();
	await expect(composer.getByText("retry.txt", { exact: true })).toBeVisible();
	expect(uploadRequests).toBe(0);
});

test("the composer keeps a failed upload for retry", async ({ page }) => {
	let attempts = 0;
	await page.route("**/rpc/attachments/upload", async (route) => {
		attempts += 1;
		if (attempts === 1) await route.abort();
		else await route.continue();
	});
	await signIn(page, "/p/CRT/table");
	await page.keyboard.press("c");
	const composer = page.getByRole("dialog", { name: "New ticket" });
	const chooser = page.waitForEvent("filechooser");
	await composer.getByRole("button", { name: "Add", exact: true }).click();
	await (await chooser).setFiles({ name: "retry.txt", mimeType: "text/plain", buffer: Buffer.from("retry") });
	const title = `Retry the attachment ${Date.now()}`;
	await composer.getByRole("textbox", { name: "Title" }).fill(title);
	await composer.getByRole("button", { name: "Create", exact: true }).click();
	await expect(composer.getByRole("alert")).toContainText("retry.txt is not attached. The upload failed.");
	await composer.getByRole("button", { name: "Retry attachments" }).click();
	await expect(composer).toBeHidden();
	expect(attempts).toBe(2);
	const list = await get<{ items: { identifier: string; title: string }[] }>("/tickets?project=CRT");
	const created = list.items.find((item) => item.title === title)!;
	const ticket = await get<{ attachments: { filename: string }[] }>(`/tickets/${created.identifier}`);
	expect(ticket.attachments.map((attachment) => attachment.filename)).toContain("retry.txt");
});
