import { describe, expect, test } from "bun:test";
import { projectId } from "../../test/fixtures.ts";
import { AgentRunnerProjectsOutputSchema, RunnerProjectSchema } from "./agent.ts";

const ok = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
	schema.safeParse(value).success;

const project = {
	id: "sp-de",
	name: "de",
	repo: "acme/web",
	path: "/Users/navid/projects/de",
	defaultBranch: "main",
};

describe("runner projects", () => {
	// `superset projects list --json` gives the id, name, repo, and path per
	// project. A project with no remote has no repo. The server adds the
	// default branch of the checkout at `path`, or null when git cannot read it.
	test("a runner project has the id, name, repo, and path of superset projects list, and its default branch", () => {
		expect(Object.keys(RunnerProjectSchema.shape).sort()).toEqual(["defaultBranch", "id", "name", "path", "repo"]);
		expect(ok(RunnerProjectSchema, project)).toBe(true);
		expect(ok(RunnerProjectSchema, { ...project, repo: null })).toBe(true);
		expect(ok(RunnerProjectSchema, { ...project, defaultBranch: null })).toBe(true);
		expect(ok(RunnerProjectSchema, { ...project, id: "" })).toBe(false);
	});

	// The settings page shows which runner project Auto picks. The server owns
	// the match rule, so the server sends the matches.
	test("the list carries the projects and one match per matched trellis project", () => {
		const matches = [{ projectId, runnerProjectId: "sp-de" }];
		expect(ok(AgentRunnerProjectsOutputSchema, { projects: [project], matches })).toBe(true);
		expect(ok(AgentRunnerProjectsOutputSchema, { projects: [project] })).toBe(false);
		expect(
			ok(AgentRunnerProjectsOutputSchema, {
				projects: [project],
				matches: [{ projectId: "CDE", runnerProjectId: "sp-de" }],
			}),
		).toBe(false);
	});
});
