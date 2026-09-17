import { expect, test } from "@playwright/test";
import { del, patch, post } from "./api";
import { ensureProject } from "./cli";
import { signIn } from "./support";

test.beforeEach(async () => {
	ensureProject("SNV", "Navigation root");
	await post("/projects", { parent: "SNV", name: "Navigation child", slug: "child" });
	ensureProject("SNZ", "Navigation archived");
	await patch("/projects/SNZ", { archived: true });
});

test.afterEach(async () => {
	await patch("/projects/SNZ", { archived: false });
	await del("/projects/SNZ?force=true");
	await del("/projects/SNV?force=true");
});

for (const project of [
	{ name: "Navigation root", path: "SNV", archived: false },
	{ name: "Navigation child", path: "SNV/child", archived: false },
	{ name: "Navigation archived", path: "SNZ", archived: true },
]) {
	test(`${project.name} opens its manager and keeps Tickets and Settings separate`, async ({ page }) => {
		await signIn(page, "/all");
		const sidebar = page.getByRole("complementary", { name: "Sidebar" });
		if (project.archived) await sidebar.getByRole("button", { name: /^Archived/ }).click();
		const projectLink = sidebar.getByRole("link", { name: project.name, exact: true });
		const pages = sidebar.getByRole("navigation", { name: `${project.name} pages` });
		const tickets = pages.getByRole("link", { name: "Tickets", exact: true });
		const settings = pages.getByRole("link", { name: "Settings", exact: true });
		const chat = pages.getByRole("link", { name: "Chat", exact: true });
		const base = `/p/${project.path}`;

		await expect(projectLink).toHaveAttribute("href", `${base}/settings/manager`);
		await expect(sidebar.getByRole("link", { name: "Manager", exact: true })).toHaveCount(0);
		await expect(pages.getByRole("link")).toHaveText(["Tickets", "Chat", "Settings"]);
		await expect(tickets).toHaveAttribute("href", base);
		await expect(chat).toHaveAttribute("href", `${base}/chat`);
		await expect(settings).toHaveAttribute("href", `${base}/settings`);

		await projectLink.click();
		await expect(page).toHaveURL(`${base}/settings/manager`);
		await expect(projectLink).toHaveAttribute("aria-current", "page");
		await expect(projectLink.locator("..")).toHaveClass(/sidebar-selected/);
		await expect(sidebar.locator('a[aria-current="page"]')).toHaveCount(1);
		await expect(tickets).not.toHaveAttribute("aria-current", "page");
		await expect(settings).not.toHaveAttribute("aria-current", "page");

		await tickets.click();
		await expect(page).toHaveURL(base);
		await expect(tickets).toHaveAttribute("aria-current", "page");
		await expect(projectLink).not.toHaveAttribute("aria-current", "page");
		await expect(projectLink.locator("..")).not.toHaveClass(/sidebar-selected/);
		await expect(settings).not.toHaveAttribute("aria-current", "page");

		await settings.click();
		await expect(page).toHaveURL(`${base}/settings`);
		await expect(settings).toHaveAttribute("aria-current", "page");
		await expect(projectLink).not.toHaveAttribute("aria-current", "page");
		await expect(projectLink.locator("..")).not.toHaveClass(/sidebar-selected/);
		await expect(tickets).not.toHaveAttribute("aria-current", "page");
	});
}
