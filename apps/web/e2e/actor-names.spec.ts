import { expect, test } from "@playwright/test";
import { createTicket, ensureProject, trellis } from "./cli";
import { signIn } from "./support";

const runId = "01M2HGY58VB4J2AYRVGDFHHB3P";

test("ticket activity and comments show the agent name instead of its identity", async ({ page }) => {
	if (ensureProject("ANM", "Actor names")) {
		createTicket("ANM", "Show named agents");
		trellis(["edit", "ANM-1", "--title", "Show the manager name"], `agent:${runId}`);
		trellis(["comment", "ANM-1", "--body", "A result for the human."], `agent:${runId}`);
	}
	await page.route("**/rpc/**", async (route) => {
		const response = await route.fetch();
		const json = JSON.parse(await response.text(), (key, value) =>
			key === "actor" && value?.name === runId ? { ...value, displayName: "Hana" } : value,
		);
		await route.fulfill({ response, json });
	});
	await signIn(page, "/t/ANM-1");
	await page.getByRole("tab", { name: "Activity", exact: true }).click();
	await expect(page.locator('[data-kind="activity"]').getByText("Hana", { exact: true }).first()).toBeVisible();
	await expect(page.getByRole("article", { name: "Comment by Hana", exact: true })).toBeVisible();
	await expect(page.getByRole("group", { name: "Thread started by Hana", exact: true })).toBeVisible();
	await expect(page.locator("[data-stream-entry]").getByText(runId, { exact: true })).toHaveCount(0);
});
