import type { AgentProjectSettings, AgentSettings, AgentSettingsSetInput, RunnerProject } from "@trellis/api";
import { sql } from "drizzle-orm";
import { matchRunnerProject, runnerUnavailable } from "../agents/runner.ts";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import type { AgentsCtx } from "./agentSessions.ts";
import { effectiveRepos } from "./agentStart.ts";
import { chainOf } from "./refs.ts";

// The agent settings live as one jsonb value under this key of the settings
// table.
const KEY = "agents";

// The value before the first setSettings: the dispatcher is off and no
// project has a manager.
export const DEFAULT_AGENT_SETTINGS: AgentSettings = { runner: "superset", enabled: false, projects: [] };

export const readAgentSettings = async (tx: Tx): Promise<AgentSettings> => {
	const [stored] = await rows<{ value: AgentSettings }>(tx, sql`SELECT value FROM settings WHERE key = ${KEY}`);
	return stored === undefined ? DEFAULT_AGENT_SETTINGS : stored.value;
};

export const get = (_ctx: ServiceCtx, tx: Tx) => readAgentSettings(tx);

// The runner project a settings row names, either by its id or through the
// repository the trellis project declares. A row the runner does not list
// would fail at the first start, so the save refuses it here instead.
const runnerProjectFor = async (
	ctx: AgentsCtx,
	projects: RunnerProject[],
	row: AgentSettingsSetInput["projects"][number],
): Promise<RunnerProject> => {
	const repos = await ctx.newTx((tx) => effectiveRepos(ctx, tx, row.projectId));
	const wanted = row.supersetProjectId ?? matchRunnerProject(projects, repos);
	const found = projects.find((project) => project.id === wanted);
	if (found !== undefined) return found;
	const detail =
		row.supersetProjectId === null
			? `No Superset project holds ${repos.map((repo) => `${repo.owner}/${repo.repo}`).join(" or ") || "a repository this project declares"}. Pick a Superset project for it.`
			: `Superset lists no project ${row.supersetProjectId}. Pick a Superset project for it.`;
	throw fail("AGENT_SETTINGS_UNUSABLE", { projectId: row.projectId, reason: "unmapped", detail });
};

// Checks every project the settings turn on before the save, because the
// manager of a project starts as soon as the save commits. A project that
// is off starts nothing, so it needs no runner and no check; that also
// leaves a way to turn agents off while the runner is down.
//
// Only a checkout that answers can refuse the base branch. The runner also
// lists projects whose checkout this machine cannot read, and trellis knows
// no branch for those, so the save goes through. A start that then fails
// records what superset printed on the session row.
export const prepareSet = async (ctx: AgentsCtx, input: AgentSettingsSetInput): Promise<AgentSettingsSetInput> => {
	requireActor(ctx);
	for (const row of input.projects) {
		if (ctx.cache.get(row.projectId) === undefined) throw fail("NOT_FOUND", { kind: "project", ref: row.projectId });
	}
	const turnedOn = input.enabled ? input.projects.filter((row) => row.enabled) : [];
	if (turnedOn.length === 0) return input;
	const projects = await ctx.runner.projects();
	for (const row of turnedOn) {
		const project = await runnerProjectFor(ctx, projects, row);
		if ((await ctx.runner.branchState(project, row.baseBranch)) !== "absent") continue;
		throw fail("AGENT_SETTINGS_UNUSABLE", {
			projectId: row.projectId,
			reason: "branch",
			detail: `The repository of the Superset project ${project.name} has no branch ${row.baseBranch}. Enter a branch it has.`,
		});
	}
	return input;
};

// A full replace. The schema fills the defaults of every project row, so
// the stored value is the value `get` returns. A settings write is not
// activity: no activity row and no event. After the commit the agents host
// reads the new settings, so a project turned on gets its manager.
export const set = async (ctx: AgentsCtx, tx: Tx, input: AgentSettingsSetInput): Promise<AgentSettings> => {
	await tx.execute(
		sql`INSERT INTO settings (key, value, updated_at) VALUES (${KEY}, ${JSON.stringify(input)}::jsonb, ${ctx.now})
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
	);
	ctx.afterCommit(async () => ctx.settingsChanged());
	return input as AgentSettings;
};

// The settings row that covers `projectId`: the row of the nearest project
// at or above it. That project owns the manager, and its builders count
// toward its limit. With the global switch off, the row's switch off, or no
// row, agents may not start and no manager is woken.
export const managedProject = (ctx: ServiceCtx, settings: AgentSettings, projectId: string): AgentProjectSettings => {
	const row = chainOf(ctx.cache, projectId)
		.map((project) => settings.projects.find((candidate) => candidate.projectId === project.id))
		.find((candidate) => candidate !== undefined);
	if (!settings.enabled || row === undefined || !row.enabled) throw runnerUnavailable("disabled");
	return row;
};
