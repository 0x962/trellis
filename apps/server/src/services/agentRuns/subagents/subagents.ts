import type { AgentSubagentsInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { nativeHost } from "../../../agents/native/harnessHost.ts";
import { rows, textArray } from "../../../db/queries/support.ts";
import { fail } from "../../../errors.ts";
import { listExecutionAttempts } from "../../assignments.ts";
import { resolveProject } from "../../refs.ts";
import type { IoCtx } from "../../support.ts";
import { type ReadEvents, readSubagentPage } from "./components/readSubagentPage/index.ts";

export async function subagents(
	ctx: Pick<IoCtx, "home" | "newTx" | "core">,
	input: AgentSubagentsInput,
	readEvents: ReadEvents = (attemptId, offset) => nativeHost(ctx.home).output(attemptId, offset, "events"),
) {
	const { runs, attempts } = await ctx.newTx(async (tx) => {
		const project = input.project === undefined ? null : await resolveProject(ctx.core, tx, input.project);
		const ids = input.runs.map((run) => run.id);
		const runs = await rows<{ id: string; preset: string }>(
			tx,
			sql`
			SELECT id, harness->>'preset' AS preset FROM agent_runs
			WHERE id=ANY(${textArray(ids)}) AND ${project === null ? sql`true` : sql`project_id=${project.id}`}`,
		);
		for (const id of ids) if (!runs.some((run) => run.id === id)) throw fail("NOT_FOUND", { kind: "agent", ref: id });
		return { runs, attempts: await listExecutionAttempts(tx, ids) };
	});
	return Promise.all(
		input.runs.map(({ id, after }) =>
			readSubagentPage(
				id,
				runs.find((run) => run.id === id)!.preset,
				attempts.filter((attempt) => attempt.runId === id),
				after,
				readEvents,
			),
		),
	);
}
