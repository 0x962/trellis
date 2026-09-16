import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Session, SessionDetail } from "@trellis/api";
import { del, get, post } from "./api";
import { signIn } from "./support";

// A command that stays alive and echoes its input, so the session has a
// live terminal and no real agent program runs.
const cat = {
	preset: "custom",
	startCommand: "/bin/sh -c 'stty -echoctl; exec /bin/cat'",
	resumeCommand: "/bin/sh -c 'stty -echoctl; exec /bin/cat'",
};

test("the sidebar lists sessions above the projects, and a row opens the session terminal", async ({ page }) => {
	const session = await post<SessionDetail>("/sessions", {
		name: "e2e sidebar session",
		prompt: "Wait for input.",
		harness: cat,
	});
	expect(session.run.processStatus).toBe("running");
	try {
		await signIn(page, "/needs-you");
		const sidebar = page.getByRole("complementary", { name: "Sidebar" });
		const sessions = sidebar.getByRole("heading", { name: "Sessions" });
		const projects = sidebar.getByRole("heading", { name: "Projects" });
		await expect(sessions).toBeVisible();
		expect((await sessions.boundingBox())!.y).toBeLessThan((await projects.boundingBox())!.y);
		const row = sidebar
			.getByRole("navigation", { name: "Sessions" })
			.getByRole("link", { name: "e2e-sidebar-session" });
		await row.click();
		await expect(page).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{26}$/);
		await expect(page.getByRole("heading", { level: 1, name: "e2e-sidebar-session" })).toBeVisible();
		await expect(page.getByRole("region", { name: "Terminal for e2e-sidebar-session", exact: true })).toBeVisible();
		await expect(row).toHaveAttribute("aria-current", "page");
	} finally {
		await del(`/sessions/${session.id}`);
	}
	expect(existsSync(session.directory)).toBe(false);
	expect((await get<Session[]>("/sessions")).some((item) => item.id === session.id)).toBe(false);
});

// The form launches the chosen agent program on this machine, so the spec
// stops before Create and covers the gate on the prompt.
test("the New session button opens a form that needs a prompt", async ({ page }) => {
	await signIn(page, "/needs-you");
	await page.getByRole("button", { name: "New session" }).click();
	const dialog = page.getByRole("dialog", { name: "New session" });
	const create = dialog.getByRole("button", { name: "Create session" });
	await expect(create).toBeDisabled();
	await dialog.getByLabel("Prompt").fill("Say hello.");
	await expect(create).toBeEnabled();
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toBeHidden();
});
