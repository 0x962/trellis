import { expect, test } from "@playwright/test";
import { type CliTicket, ensureProject, runPasted } from "./cli";
import { rowOf, signIn } from "./support";

test.beforeAll(() => {
	ensureProject("EMP", "Empty");
});

// The empty state of a project prints a CLI line. The real CLI parses that
// line, and the line pasted into a shell creates the first ticket.
test("empty > the CLI line of an empty project creates its first ticket", async ({ page }) => {
	await signIn(page, "/p/EMP");
	const line = page.getByText(/^trellis create /);
	await expect(line).toHaveText('trellis create -p EMP -t "First ticket"');
	const created = runPasted<CliTicket>((await line.textContent())!);
	expect(created.identifier).toBe("EMP-1");
	await expect(rowOf(page, "EMP-1")).toBeVisible();
});
