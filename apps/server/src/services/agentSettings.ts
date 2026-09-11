import type { AgentProjectSettings, AgentSettings, AgentSettingsSetInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { runnerUnavailable } from "../agents/runner.ts";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import type { AgentsCtx } from "./agentSessions.ts";
import { chainOf, pathOf } from "./refs.ts";

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

// A base branch the repository does not hold makes every agent of that
// project fail inside `superset ws create`, and the person who saved the
// setting never learns why. So the save reads the checkout first and
// refuses. A checkout this machine cannot read passes instead: Superset
// also lists projects that live on another machine or that nobody cloned
// here, and those must stay saveable.
const refuseMissingBaseBranch = async (ctx: AgentsCtx, input: AgentSettingsSetInput) => {
	if (!input.enabled) return;
	for (const row of input.projects) {
		const baseBranch = row.baseBranch ?? null;
		if (!row.enabled || row.supersetProjectId === null || baseBranch === null) continue;
		if ((await ctx.runner.branchState(row.supersetProjectId, baseBranch)) !== "absent") continue;
		throw runnerUnavailable(
			"branch",
			`${pathOf(ctx.cache, row.projectId)}: the repository holds no branch "${baseBranch}". Name a branch it holds, or clear the base branch to take the default of the checkout.`,
		);
	}
};

// A full replace. The schema fills the defaults of every project row, so
// the stored value is the value `get` returns. A settings write is not
// activity: no activity row and no event. After the commit the agents host
// reads the new settings, so a project turned on gets its manager.
export const set = async (ctx: AgentsCtx, tx: Tx, input: AgentSettingsSetInput): Promise<AgentSettings> => {
	requireActor(ctx);
	for (const row of input.projects) {
		if (ctx.cache.get(row.projectId) === undefined) throw fail("NOT_FOUND", { kind: "project", ref: row.projectId });
	}
	await refuseMissingBaseBranch(ctx, input);
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
