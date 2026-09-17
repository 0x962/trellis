import { expect, test } from "@playwright/test";
import { signIn } from "./support";

test("Loops exposes management state and permits one pass while paused", async ({ page }) => {
	await signIn(page, "/loops");
	await expect(page.getByRole("link", { name: "Loops", exact: true })).toHaveAttribute("aria-current", "page");
	const loop = page.getByRole("region", { name: "Deterministic manager", exact: true });
	await expect(loop.getByText("Current step", { exact: true })).toBeVisible();
	await loop.getByRole("button", { name: "Pause loop", exact: true }).click();
	await expect(loop.getByRole("button", { name: "Resume loop", exact: true })).toBeEnabled();
	await expect(loop.getByRole("button", { name: "Run now", exact: true })).toBeEnabled({ timeout: 30000 });
	await loop.getByRole("button", { name: "Clear output and errors", exact: true }).click();
	await expect(loop.getByRole("log", { name: "Loop output" })).toHaveText("No output yet.");
	const count = loop.locator("dt", { hasText: /^Passes$/ }).locator("+ dd");
	const before = Number(await count.textContent());
	await loop.getByRole("button", { name: "Run now", exact: true }).click();
	await expect(count).toHaveText(String(before + 1));
	await expect(loop.getByRole("button", { name: "Resume loop", exact: true })).toBeEnabled();
	await loop.getByRole("button", { name: "Resume loop", exact: true }).click();
	await expect(loop.getByRole("button", { name: "Pause loop", exact: true })).toBeEnabled();
});
