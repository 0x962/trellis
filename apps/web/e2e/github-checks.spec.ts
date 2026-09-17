import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { AgentRun, Persona, Ticket } from "@trellis/api";
import { patch, post } from "./api";
import { failingPrUrl } from "./ghReplies";
import { signIn } from "./support";

test("checks show GitHub sections without a local evidence request", async ({ page }) => {
	const repo = await mkdtemp(join(tmpdir(), "trellis-checks-e2e-"));
	let run: AgentRun | undefined;
	try {
		await writeFile(join(repo, "README.md"), "Fixture workspace\n");
		for (const args of [
			["init", "-q"],
			["add", "."],
			["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "Fixture"],
		])
			execFileSync("git", ["-C", repo, ...args]);
		await post("/projects", { key: "EVC", name: "GitHub checks" });
		await patch("/projects/EVC", {
			managerConfig: {
				personaId: null,
				directory: repo,
				harness: { preset: "custom", startCommand: "/bin/cat", resumeCommand: "/bin/cat" },
			},
		});
		const ticket = await post<Ticket>("/tickets", { project: "EVC", title: "Review GitHub checks" });
		const persona = await post<Persona>("/personas", {
			name: "Checks fixture",
			kind: "builder",
			instruction: "Wait for verification.",
		});
		run = await post<AgentRun>("/agent-runs", { ticket: ticket.identifier, personaId: persona.id });
		await post(`/tickets/${ticket.identifier}/prs`, { url: failingPrUrl });
		const evidenceRequests: string[] = [];
		page.on("request", (request) => {
			const callsEvidenceList =
				request.url().includes("/evidence/list") || request.postData()?.includes("/evidence/list");
			if (callsEvidenceList) evidenceRequests.push(request.url());
		});

		await signIn(page, `/t/${ticket.identifier}`);
		await page.getByRole("tab", { name: "Checks", exact: true }).click();
		const github = page.getByRole("region", { name: "acme/web #7", exact: true });
		await expect(github.getByRole("link", { name: "lint", exact: true })).toBeVisible();
		await expect(github.getByRole("link", { name: "typecheck (desktop)", exact: true })).toBeVisible();
		await expect(page.getByRole("region", { name: "Local evidence", exact: true })).toHaveCount(0);
		expect(evidenceRequests).toEqual([]);
	} finally {
		if (run?.id) await post(`/agent-runs/${run.id}/stop`, {});
		await rm(repo, { recursive: true, force: true });
	}
});
