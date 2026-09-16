import { expect, test } from "@playwright/test";
import { get, patch, post, put } from "./api";
import { createTicket, ensureProject, moveTicket, trellis } from "./cli";
import { failingPrUrl } from "./ghReplies";
import { mapRpcResponse } from "./mapRpcResponse";
import { rowOf, signIn } from "./support";

// signIn sets the actor name on the shared server. Each test restores the saved settings.
let before: unknown;
test.beforeEach(async () => {
	before = await get("/settings");
});
test.afterEach(async () => {
	await put("/settings", before);
});

// NYO-1 links a pull request with a failed check, and NYO-2 waits in Human
// Review.
test.beforeAll(() => {
	if (!ensureProject("NYO", "Needs you")) return;
	createTicket("NYO", "Fix the desktop typecheck", ["--status", "in-progress"]);
	trellis(["pr", "add", "NYO-1", failingPrUrl]);
	createTicket("NYO", "Read the release notes", ["--status", "human-review"]);
});

test("needs-you > human review tickets qualify across roots and subprojects", async ({ page }) => {
	ensureProject("NYR", "Another review project");
	const other = createTicket("NYR", "Review another project", ["--status", "human-review"]);
	const agent = createTicket("NYR", "Agent review stays out", ["--status", "agent-review"]);
	trellis(["projects", "create", "--parent", "NYR", "--name", "Web", "--slug", "web"]);
	const child = createTicket("NYR.web", "Review a subproject", ["--status", "human-review"]);
	await post("/projects/NYR/statuses", { name: "Final approval", category: "review", reviewer: "human" });
	const custom = createTicket("NYR", "Review a custom status", ["--status", "final-approval"]);

	await signIn(page, "/needs-you");
	await expect(page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
	await expect(
		page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Needs you" }),
	).toBeVisible();
	for (const identifier of ["NYO-2", other.identifier, child.identifier, custom.identifier]) {
		await expect(rowOf(page, identifier)).toBeVisible();
	}
	await expect(rowOf(page, "NYO-1")).toHaveCount(0);
	await expect(rowOf(page, agent.identifier)).toHaveCount(0);
	await rowOf(page, child.identifier).getByText("Review a subproject", { exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/t/${child.identifier}$`));
});

test("needs-you > status and reviewer changes update membership live", async ({ page }) => {
	ensureProject("NYL", "Live review");
	const ticket = createTicket("NYL", "Review live changes");
	await signIn(page, "/needs-you");
	await expect(rowOf(page, "NYO-2")).toBeVisible();
	await expect(rowOf(page, ticket.identifier)).toHaveCount(0);
	moveTicket(ticket.identifier, "human-review");
	await expect(rowOf(page, ticket.identifier)).toBeVisible();
	moveTicket(ticket.identifier, "agent-review");
	await expect(rowOf(page, ticket.identifier)).toHaveCount(0);
	moveTicket(ticket.identifier, "human-review");
	await expect(rowOf(page, ticket.identifier)).toBeVisible();
	await patch("/projects/NYL/statuses/human-review", { reviewer: "agent" });
	await expect(rowOf(page, ticket.identifier)).toHaveCount(0);
	await patch("/projects/NYL/statuses/human-review", { reviewer: "human" });
	await expect(rowOf(page, ticket.identifier)).toBeVisible();
	moveTicket(ticket.identifier, "done", "human:dana");
	await expect(rowOf(page, ticket.identifier)).toHaveCount(0);
});

test("needs-you > an empty review list explains which tickets qualify", async ({ page }) => {
	await page.route(/\/rpc\/(__batch__|tickets\/(list|counts))/, (route) =>
		mapRpcResponse(route, (key, value) => {
			if (key === "items" || key === "byStatus") return [];
			if (key === "total") return 0;
			if (key === "nextCursor") return null;
			return value;
		}),
	);
	await signIn(page, "/needs-you");
	await expect(page.getByRole("heading", { name: "Nothing needs review" })).toBeVisible();
	await expect(page.getByText("Tickets in human review appear here.")).toBeVisible();
	await expect(page.getByRole("link", { name: "Clear filters" })).toHaveCount(0);
});

test("needs-you > a failed request shows an error instead of an empty review list", async ({ page }) => {
	await page.route("**/rpc/**", (route) => {
		const request = route.request();
		const hasList = request.url().includes("/tickets/list") || request.postData()?.includes("/tickets/list");
		return hasList ? route.abort("failed") : route.continue();
	});
	await signIn(page, "/needs-you");
	await expect(page.getByRole("heading", { name: "The tickets did not load." })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Nothing needs review" })).toHaveCount(0);
});

// E2E-04. The settings live on the server, so a reload shows them again.
// The gh stub answers `gh auth status` as signed out.
test("needs-you > settings persist across a reload and the gh banner matches the stub", async ({ page }) => {
	await signIn(page, "/settings");
	const name = page.getByRole("textbox", { name: /your name/i });
	await name.fill("Nav");
	const saved = page.waitForResponse(
		(response) => response.url().includes("settings/set") && (response.request().postData() ?? "").includes("Nav"),
	);
	await page.keyboard.press("Tab");
	await saved;
	await page.reload();
	await expect(page.getByRole("textbox", { name: /your name/i })).toHaveValue("Nav");
	// The name sits on Account and the gh banner on Integrations, so the
	// section navigation carries the page from the one to the other.
	await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Integrations" }).click();
	const banner = page.getByRole("alert");
	await expect(banner).toContainText("gh is not signed in");
	// gh's own message names the command too, so the check finds the chip.
	await expect(page.getByText("gh auth login", { exact: true })).toBeVisible();
});
