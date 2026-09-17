import { expect, test } from "@playwright/test";
import { createTicket, ensureProject, moveTicket, trellis } from "./cli";
import { mapRpcResponse } from "./mapRpcResponse";
import { cardOf, rowOf, signIn } from "./support";

const runId = "01M2HGY58VB4J2AYRVGDFHHB3P";

test("ticket activity and comments show the agent name instead of its identity", async ({ page }) => {
	if (ensureProject("ANM", "Actor names")) {
		createTicket("ANM", "Show named agents");
		trellis(["edit", "ANM-1", "--title", "Show the manager name"], `agent:${runId}`);
		trellis(["comment", "ANM-1", "--body", "A result for the human."], `agent:${runId}`);
	}
	await page.route(/\/rpc\/(__batch__|tickets|timeline|comments|search)/, (route) =>
		mapRpcResponse(route, (key, value) =>
			key === "actor" && value?.name === runId ? { ...value, displayName: "Hana" } : value,
		),
	);
	await signIn(page, "/t/ANM-1");
	await page.getByRole("tab", { name: "Activity", exact: true }).click();
	await expect(page.locator('[data-kind="activity"]').getByText("Hana", { exact: true }).first()).toBeVisible();
	await expect(page.getByRole("article", { name: "Comment by Hana", exact: true })).toBeVisible();
	await expect(page.getByRole("group", { name: "Thread started by Hana", exact: true })).toBeVisible();
	await expect(page.locator("[data-stream-entry]").getByText(runId, { exact: true })).toHaveCount(0);
});

test("ticket rows use the agent display name in Needs you and the board", async ({ page }) => {
	ensureProject("ANR", "Actor rows");
	const ticket = createTicket("ANR", "Named last actor");
	moveTicket(ticket.identifier, "human-review");
	trellis(["comment", ticket.identifier, "--body", "Ready for the human."], `agent:${runId}`);
	await page.route(/\/rpc\/(__batch__|tickets|timeline|comments|search)/, (route) =>
		mapRpcResponse(route, (key, value) =>
			(key === "lastActor" || value?.kind === "agent") && value?.name === runId
				? { ...value, displayName: "Hana" }
				: value,
		),
	);
	await signIn(page, "/needs-you");
	const inbox = rowOf(page, ticket.identifier);
	await expect(inbox.getByRole("img", { name: "Hana · agent" })).toBeVisible();
	await page.goto(`/p/ANR/board?actor=${encodeURIComponent(`agent:${runId}`)}`);
	await expect(page.locator('[data-filter-chip="actor"]').getByText("Hana", { exact: true })).toBeVisible();
	await expect(cardOf(page, ticket.identifier).getByRole("img", { name: "Hana · agent" })).toBeVisible();
});
