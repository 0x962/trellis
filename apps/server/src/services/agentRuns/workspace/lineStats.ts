import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { workspaceBaseRef } from "../../../agents/native/workspaceBase.ts";
import { rows, textArray } from "../../../db/queries/support.ts";
import { git } from "./git.ts";
import type { WorkspaceCtx } from "./types.ts";

type Target = { ticketId: string; workspace: string };

const numstat = (text: string) => {
	let additions = 0;
	let deletions = 0;
	const records = text.split("\0");
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index]!;
		if (record === "") continue;
		const [added, deleted, path] = record.split("\t", 3);
		if (added !== "-") additions += Number(added);
		if (deleted !== "-") deletions += Number(deleted);
		if (path === "") index += 2;
	}
	return { additions, deletions };
};

const lineCount = async (path: string) => {
	const info = await lstat(path);
	if (info.isSymbolicLink()) return 1;
	if (!info.isFile()) return 0;
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
export const countWorkspace = async (workspace: string) => {
	const base = (await git(workspace, ["rev-parse", "--verify", workspaceBaseRef])).trim();
	const tracked = numstat(
		await git(workspace, ["diff", "--merge-base", "--numstat", "-z", "--find-renames", base, "--"]),
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
				WHERE r.ticket_id = ANY(${textArray(input.ticketIds)})
					AND r.kind = 'agent'
					AND r.runtime = 'native'
					AND r.workspace_id IS NOT NULL
					AND r.closed_at IS NULL
				ORDER BY r.ticket_id, r.created_at DESC, r.id DESC
			`,
		),
	);
	const result: { ticketId: string; additions: number; deletions: number }[] = [];
	for (const target of targets) {
		const stat = await countWorkspace(target.workspace).catch(() => null);
		if (stat !== null) result.push({ ticketId: target.ticketId, ...stat });
	}
	return result;
};
