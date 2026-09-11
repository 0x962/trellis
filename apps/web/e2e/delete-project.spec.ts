import { expect, test } from "@playwright/test";
import { get } from "./api";
import { createTicket, ensureProject } from "./cli";
import { signIn } from "./support";

test.beforeAll(() => {
	ensureProject("DEL", "Doomed");
	createTicket("DEL", "First doomed ticket");
	createTicket("DEL", "Second doomed ticket");
});

// A delete with tickets is permanent, so the dialog states the count and
// waits for the typed key.
test("deleting a project with tickets takes the typed key and lands on All tickets", async ({ page }) => {
	const { total } = await get<{ total: number }>("/tickets/counts?project=DEL");
	expect(total).toBeGreaterThanOrEqual(2);
	// Project settings groups its rows into sections, and the hash picks one.
	// Delete lives under Archive and delete.
	await signIn(page, "/p/DEL/settings#archive");
	await page.getByRole("button", { name: "Delete project…" }).click();
	const dialog = page.getByRole("dialog", { name: "Delete Doomed?" });
	await expect(dialog).toContainText(`${total} tickets`);
	const confirm = dialog.getByRole("button", { name: "Delete project", exact: true });
	await expect(confirm).toBeDisabled();
	await dialog.getByRole("textbox", { name: "Type DEL to confirm" }).fill("DEL");
	await confirm.click();
	await expect(page).toHaveURL(/\/all$/);
	await expect(page.getByRole("navigation", { name: "Projects" }).getByRole("link", { name: /Doomed/ })).toHaveCount(0);
	const projects = await get<{ key: string }[]>("/projects");
	expect(projects.some((project) => project.key === "DEL")).toBe(false);
});
