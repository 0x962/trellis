import { describe, expect, test } from "bun:test";
import { projectId } from "../../test/fixtures.ts";
import { AgentRunnerProjectsOutputSchema, RunnerProjectSchema } from "./agent.ts";

const ok = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
	schema.safeParse(value).success;

const project = { id: "sp-de", name: "de", repo: "canary-technologies-corp/de", path: "/Users/navid/projects/de" };

describe("runner projects", () => {
	// `superset projects list --json` gives these four fields per project. A
	// project with no remote has no repo.
	test("a runner project has the id, name, repo, and path of superset projects list", () => {
		expect(Object.keys(RunnerProjectSchema.shape).sort()).toEqual(["id", "name", "path", "repo"]);
		expect(ok(RunnerProjectSchema, project)).toBe(true);
		expect(ok(RunnerProjectSchema, { ...project, repo: null })).toBe(true);
		expect(ok(RunnerProjectSchema, { ...project, id: "" })).toBe(false);
	});

	// The settings page shows which runner project Auto picks. The server owns
	// the match rule, so the server sends the matches.
	test("the list carries the projects and one match per matched trellis project", () => {
		const matches = [{ projectId, runnerProjectId: "sp-de" }];
		expect(ok(AgentRunnerProjectsOutputSchema, { projects: [project], matches })).toBe(true);
		expect(ok(AgentRunnerProjectsOutputSchema, { projects: [project] })).toBe(false);
		expect(
			ok(AgentRunnerProjectsOutputSchema, { projects: [project], matches: [{ projectId: "CDE", runnerProjectId: "sp-de" }] }),
		).toBe(false);
	});
});
