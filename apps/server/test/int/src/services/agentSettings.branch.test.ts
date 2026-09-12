import { describe, expect, test } from "bun:test";
import { agentsHarness } from "../../../helpers/agents.ts";
import { gitRepo, remoteBranch } from "../../../helpers/gitRepo.ts";

// Saving a base branch the repository does not hold. Every agent of the
// project would fail inside `superset ws create`, so the save refuses and
// names the branch.

const a = agentsHarness();

const save = (projectId: string, baseBranch: string | null) =>
	a.t.api("/api/agents/settings", {
		method: "PUT",
		body: {
			runner: "superset",
			enabled: true,
			projects: [
				{
					projectId,
					enabled: true,
					supersetProjectId: "sp-web",
					baseBranch,
					maxConcurrent: 3,
					removeWorkspaceOnDone: true,
				},
			],
		},
	});

// Points the one Superset project of the stub at a real checkout.
const checkoutAt = (path: string) =>
	a.stub.update((state) => {
		state.projects[0]!.path = path;
	});

describe("the base branch check of a settings save", () => {
	test("a base branch the repository does not hold is refused, and the message names the project and the branch", async () => {
		const path = gitRepo("main");
		remoteBranch(path, "main");
		checkoutAt(path);
		const project = await a.enable({ baseBranch: null });
		const refused = await save(project.id, "develop");
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ data: { reason: "branch" } });
		expect(refused.body.message).toContain(a.key);
		expect(refused.body.message).toContain("develop");
	});

	test("a base branch the repository holds is saved", async () => {
		const path = gitRepo("main");
		remoteBranch(path, "develop");
		checkoutAt(path);
		const project = await a.enable({ baseBranch: null });
		const saved = await save(project.id, "develop");
		expect(saved.status).toBe(200);
		expect((await a.t.api("/api/agents/settings", { actor: null })).body.projects[0].baseBranch).toBe("develop");
	});

	test("a checkout this machine cannot read is saved, because Superset lists projects nobody cloned here", async () => {
		checkoutAt("/src/web");
		const project = await a.enable({ baseBranch: null });
		expect((await save(project.id, "develop")).status).toBe(200);
	});

	test("a branch name that only starts another branch name is refused", async () => {
		const path = gitRepo("main");
		remoteBranch(path, "m0/api");
		checkoutAt(path);
		const project = await a.enable({ baseBranch: null });
		const refused = await save(project.id, "m0");
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ data: { reason: "branch" } });
	});

	test("the check is skipped while the global switch is off, so a person can always turn agents off", async () => {
		const path = gitRepo("main");
		remoteBranch(path, "main");
		checkoutAt(path);
		const project = await a.enable({ baseBranch: null });
		const off = await a.t.api("/api/agents/settings", {
			method: "PUT",
			body: {
				runner: "superset",
				enabled: false,
				projects: [
					{
						projectId: project.id,
						enabled: true,
						supersetProjectId: "sp-web",
						baseBranch: "develop",
						maxConcurrent: 3,
						removeWorkspaceOnDone: true,
					},
				],
			},
		});
		expect(off.status).toBe(200);
	});
});
