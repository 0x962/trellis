import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { AgentRun, Persona, Ticket } from "@trellis/api";
import { patch, post } from "./api";
import { signIn } from "./support";

test("local files return to the diff", async ({ page }) => {
	const repo = await mkdtemp(join(tmpdir(), "trellis-local-changes-e2e-"));
	let run: AgentRun | undefined;
	try {
		await writeFile(join(repo, "README.md"), "Initial workspace\n");
		for (const args of [
			["init", "-q"],
			["add", "."],
			["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "Fixture"],
		])
			execFileSync("git", ["-C", repo, ...args]);
		await post("/projects", { key: "CHG", name: "Local changes" });
		await patch("/projects/CHG", {
			managerConfig: {
				personaId: null,
				directory: repo,
				ade: "native",
				dispatchPaused: true,
				harness: { preset: "custom", startCommand: "/bin/cat", resumeCommand: "/bin/cat" },
			},
		});
		const ticket = await post<Ticket>("/tickets", { project: "CHG", title: "Review local output" });
		const persona = await post<Persona>("/personas", {
			name: "Changes fixture",
			kind: "builder",
			instruction: "Wait for verification.",
		});
		run = await post<AgentRun>("/agent-runs", { ticket: ticket.identifier, personaId: persona.id });
		expect(run.state).toBe("running");
		await writeFile(join(run.workspaceId!, "README.md"), "Updated workspace for review\n");
		await writeFile(join(run.workspaceId!, "result.txt"), "local output\n");
		await signIn(page, `/t/${ticket.identifier}`);
		await page.getByRole("tab", { name: "Changes", exact: true }).click();
		const changes = page.getByRole("region", { name: "Local changes", exact: true });
		await expect(changes.getByText(/\+Updated workspace for review/)).toBeVisible();
		await changes.getByRole("combobox", { name: "Workspace file" }).click();
		await page.getByRole("option", { name: "?? result.txt", exact: true }).click();
		await expect(changes.getByText("local output", { exact: true })).toBeVisible();
		await changes.getByRole("combobox", { name: "Workspace file" }).click();
		await page.getByRole("option", { name: "Workspace diff", exact: true }).click();
		await expect(changes.getByText(/\+Updated workspace for review/)).toBeVisible();
		await expect(page.getByRole("region", { name: "Local evidence", exact: true })).toHaveCount(0);
	} finally {
		if (run?.id) {
			await post("/native-work/stop", {});
			await post("/native-work/resume", {});
		}
		await rm(repo, { recursive: true, force: true });
	}
});
