import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { AgentRun, NativeMigrationInventory, Persona, Project } from "@trellis/api";
import { get, patch, post, put } from "./api";
import { scriptFailure, supersetState, supersetStatePath } from "./supersetStub";
import { signIn } from "./support";

test("a versioned local migration preserves history and requires repository trust", async ({ page }) => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-migration-e2e-"));
	try {
		await post("/projects", { key: "MIG", name: "Migration preview" });
		await post("/tickets", { project: "MIG", title: "Keep this ticket" });
		await page.addInitScript((path) => {
			Object.defineProperty(window, "trellisDesktop", {
				value: { platform: "darwin", chooseDirectory: async () => path },
			});
		}, directory);
		await signIn(page, "/p/MIG/settings/manager");
		await page.getByRole("button", { name: "Use local execution", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "Use local execution", exact: true });
		await dialog.getByRole("button", { name: "Choose repository directory" }).click();
		await expect(dialog.getByRole("textbox", { name: "Local repository directory" })).toHaveValue(directory);
		const apply = dialog.getByRole("button", { name: "Confirm local execution" });
		await expect(apply).toBeDisabled();
		await dialog.getByRole("checkbox").check();
		const snapshot = await get<NativeMigrationInventory>("/native-migrations/inventory?project=MIG");
		await patch("/projects/MIG", { name: "Changed after preview" });
		await apply.click();
		await expect(dialog.getByRole("alert")).toContainText(
			"changed. Read the migration inventory again and use its current version.",
		);
		expect((await get<Project>("/projects/MIG")).managerConfig?.ade).toBe("superset");
		await dialog.getByRole("button", { name: "Refresh migration preview" }).click();
		await expect(dialog.getByRole("checkbox")).not.toBeChecked();
		await dialog.getByRole("checkbox").check();
		await apply.click();
		await expect(dialog).toHaveCount(0);
		const project = await get<Project>("/projects/MIG");
		expect(project.managerConfig).toMatchObject({
			ade: "native",
			directory,
			dispatchPaused: true,
			trustedDirectory: false,
		});
		const migrated = await get<NativeMigrationInventory>("/native-migrations/inventory?project=MIG");
		expect(migrated.migrations).toHaveLength(1);
		expect(migrated.migrations[0]!.expectedVersion).not.toBe(snapshot.version);
		await expect(page.getByRole("switch", { name: "Automatic dispatch" })).not.toBeChecked();
		await page.goto("/t/MIG-1");
		await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Keep this ticket");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("unavailable external ownership and unknown delivery have explicit recovery actions", async ({ page }) => {
	const directory = join(process.env.TRELLIS_E2E_ROOT!, "repos", "cde");
	const state = supersetState();
	state.projects.find((project) => project.id === "sp-cde")!.repo = "https://github.com/acme/cde";
	await writeFile(supersetStatePath(process.env.TRELLIS_E2E_ROOT!), JSON.stringify(state));
	const persona = await post<Persona>("/personas", { name: "Recovery manager", kind: "manager", instruction: "Wait." });
	await post("/projects", {
		key: "RCV",
		name: "External recovery",
		managerConfig: {
			personaId: persona.id,
			concurrency: 3,
			directory,
			ade: "superset",
			dispatchPaused: false,
			harness: { preset: "custom", startCommand: "/bin/cat", resumeCommand: "/bin/cat" },
		},
	});
	await put("/projects/RCV/repos", { repos: [{ owner: "acme", repo: "cde" }] });
	const run = await post<AgentRun>("/agent-runs", { project: "RCV", personaId: persona.id });
	expect(run.error).toBeNull();
	expect(run).toMatchObject({ state: "running" });
	try {
		scriptFailure("terminals send", "Fixture transport receipt is unknown");
		await post("/tickets", { project: "RCV", title: "Uncertain delivery" });
		await expect
			.poll(
				async () =>
					(await get<{ state: string }[]>(`/manager-dispatches?projectId=${run.projectId}`)).some(
						(row) => row.state === "unknown",
					),
				{ timeout: 25000 },
			)
			.toBe(true);
		scriptFailure("terminals list", "Fixture external host is unavailable");
		await post(`/agent-runs/${run.id}/refresh`, {});
		await signIn(page, "/p/RCV/settings/manager");
		await expect(page.getByText("External session unavailable", { exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Resume manager", exact: true })).toBeDisabled();
		await page.getByRole("button", { name: "Cancel delivery", exact: true }).click();
		const cancel = page.getByRole("dialog", { name: "Cancel delivery?" });
		await expect(cancel.getByText(/The receipt remains unknown/)).toBeVisible();
		await cancel.getByRole("textbox", { name: "Reason" }).fill("The old environment is no longer in use.");
		await cancel.getByRole("button", { name: "Cancel delivery", exact: true }).click();
		await expect(cancel).toHaveCount(0);
		await expect(page.getByText("Cancelled · receipt unknown", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Use local execution", exact: true }).click();
		const migration = page.getByRole("dialog", { name: "Use local execution", exact: true });
		await expect(migration.getByText(run.terminalId!, { exact: true })).toBeVisible();
		await migration.getByRole("button", { name: `Retire assignment ${run.id}` }).click();
		const retire = page.getByRole("dialog", { name: "Retire assignment?" });
		await expect(retire.getByRole("button", { name: "Retire assignment", exact: true })).toBeDisabled();
		await retire.getByRole("checkbox").check();
		await retire.getByRole("button", { name: "Retire assignment", exact: true }).click();
		await expect(retire).toHaveCount(0);
		await migration.getByRole("button", { name: "Close migration preview" }).click();
		await expect(page.getByRole("switch", { name: "Automatic dispatch" })).not.toBeChecked();
		await page.getByRole("button", { name: "Use local execution", exact: true }).click();
		await expect(migration.getByRole("region", { name: "Migration blockers" })).toHaveCount(0);
		await migration.getByRole("checkbox").check();
		await migration.getByRole("button", { name: "Confirm local execution" }).click();
		await expect(migration).toHaveCount(0);
		await page.getByRole("link", { name: "General", exact: true }).click();
		await page.getByRole("checkbox", { name: "Trust this repository", exact: true }).check();
		await post("/native-work/resume", {});
		await expect(page.getByRole("button", { name: "Start manager", exact: true })).toBeEnabled();
		const history = await get<AgentRun[]>("/agent-runs?project=RCV");
		expect(history).toHaveLength(1);
		expect(history[0]).toMatchObject({
			id: run.id,
			state: "failed",
			terminalId: run.terminalId,
			workspaceId: run.workspaceId,
		});
		await page.goto("/inbox");
		await expect(page.getByRole("region", { name: "Manager needs attention" })).toHaveCount(0);
	} finally {
		scriptFailure("terminals send", null);
		scriptFailure("terminals list", null);
		const restored = supersetState();
		restored.projects.find((project) => project.id === "sp-cde")!.repo = "acme/cde";
		await writeFile(supersetStatePath(process.env.TRELLIS_E2E_ROOT!), JSON.stringify(restored));
	}
});
