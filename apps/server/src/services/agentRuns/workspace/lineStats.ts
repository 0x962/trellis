import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { rows, textArray } from "../../../db/queries/support.ts";
import { git } from "./git.ts";
import type { WorkspaceCtx } from "./types.ts";

type Target = { ticketId: string; workspace: string };

const numstat = (text: string) => {
	let additions = 0;
	let deletions = 0;
	for (const record of text.split("\0")) {
		if (record === "") continue;
		const [added, deleted] = record.split("\t", 2);
		if (added !== "-") additions += Number(added);
		if (deleted !== "-") deletions += Number(deleted);
	}
	return { additions, deletions };
};

const lineCount = async (path: string) => {
	const info = await lstat(path);
	if (info.isSymbolicLink()) return 1;
	let bytes = 0;
	let lines = 0;
	let last = 0;
	let inspected = 0;
	for await (const chunk of createReadStream(path)) {
		const buffer = chunk as Buffer;
		const sample = buffer.subarray(0, Math.max(0, 8000 - inspected));
		if (sample.includes(0)) return 0;
		inspected += sample.length;
		bytes += buffer.length;
		last = buffer.at(-1) ?? last;
		for (const byte of buffer) if (byte === 10) lines += 1;
	}
	return bytes === 0 ? 0 : lines + (last === 10 ? 0 : 1);
};

const countWorkspace = async (workspace: string) => {
	const tracked = numstat(
		await git(workspace, ["diff", "--merge-base", "--numstat", "-z", "--no-renames", "refs/remotes/origin/HEAD", "--"]),
	);
	const untracked = (await git(workspace, ["ls-files", "--others", "--exclude-standard", "-z"]))
		.split("\0")
		.filter(Boolean);
	let additions = tracked.additions;
	for (const path of untracked) additions += await lineCount(join(workspace, path));
	return { additions, deletions: tracked.deletions };
};

export const lineStats = async (ctx: WorkspaceCtx, input: { ticketIds: string[] }) => {
	const targets = await ctx.newTx((tx) =>
		rows<Target>(
			tx,
			sql`
				SELECT DISTINCT ON (r.ticket_id)
					r.ticket_id AS "ticketId", r.workspace_id AS workspace
				FROM agent_runs r
				JOIN tickets t ON t.id = r.ticket_id
				JOIN statuses s ON s.id = t.status_id
				WHERE r.ticket_id = ANY(${textArray(input.ticketIds)})
					AND r.kind = 'builder'
					AND r.runtime = 'native'
					AND r.workspace_id IS NOT NULL
					AND r.closed_at IS NULL
					AND s.category = 'started'
				ORDER BY r.ticket_id, r.created_at DESC, r.id DESC
			`,
		),
	);
	const result: { ticketId: string; additions: number; deletions: number }[] = [];
	for (const target of targets) result.push({ ticketId: target.ticketId, ...(await countWorkspace(target.workspace)) });
	return result;
};
