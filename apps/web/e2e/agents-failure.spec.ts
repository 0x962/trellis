import { expect, test } from "@playwright/test";
import { ensureProject, trellis } from "./cli";
import { scriptFailure, tabOf } from "./supersetStub";
import { signIn } from "./support";

// A manager that cannot start says so in the project header, with the
// reason superset gave, a link to the full error, and a Retry. The superset
// stub refuses `ws create` as Superset does for a base branch the repository
// does not have. The header carries the failure alone, so a manager that
// starts leaves the header empty and the Agents page holds its state.

const human = "human:navid";
const refusal = "fatal: invalid reference: main";

// The server starts the manager a moment after the settings save; each of
// its superset calls spawns the stub.
const START_MS = 10_000;

test("agents > a failed manager start shows Manager failed with the reason, and Retry starts it after the fix", async ({
	page,
}) => {
	test.setTimeout(60_000);
	ensureProject("FAIL", "Failing");
	trellis(["projects", "repos", "FAIL", "--add", "acme/fail"], human);
	scriptFailure("ws create", refusal);
	trellis(["agents", "on"], human);
	trellis(["agents", "on", "--project", "FAIL"], human);

	await signIn(page, "/p/FAIL");
	const manager = page.getByRole("group", { name: "Manager" });
	await expect(manager).toContainText(`Manager failed: superset ws create: ${refusal}`, { timeout: START_MS });

	// The link opens the full error on the Agents page.
	await manager.getByRole("link", { name: "Details" }).click();
	await expect(page).toHaveURL(/\/agents#/);
	await expect(page.getByRole("region", { name: "FAIL sessions" })).toContainText(refusal);
	await page.goBack();

	// After the fix, Retry starts the manager and the header clears.
	scriptFailure("ws create", null);
	await manager.getByRole("button", { name: "Retry" }).click();
	await expect(manager).toBeHidden({ timeout: START_MS });
	await expect.poll(() => tabOf("FAIL manager"), { timeout: START_MS }).toBeDefined();

	trellis(["agents", "off", "--project", "FAIL"], human);
	trellis(["agents", "off"], human);
});
