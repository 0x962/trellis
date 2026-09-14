import { realpath, stat } from "node:fs/promises";
import { relative } from "node:path";
import type { EvidenceArtifact } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { invalidInput } from "../../errors.ts";
import { hashFile } from "./hashFile.ts";
import { revision } from "./revision.ts";
import { safeFile } from "./safeFile.ts";
import { target } from "./target.ts";
import type { EvidenceCtx } from "./types.ts";

export const register = async (ctx: EvidenceCtx, input: { runId: string; path: string }) => {
	const selected = await ctx.newTx((tx) => target(ctx.core, tx, { ...input, mutation: true }));
	const absolute = await safeFile(selected.workspace, input.path);
	const info = await stat(absolute);
	if (!info.isFile()) throw invalidInput("path", "Register a file in the agent workspace.");
	const path = relative(await realpath(selected.workspace), absolute);
	const state = await revision(selected.workspace);
	const sha256 = await hashFile(absolute);
	if (!state.files.some((file) => file.path === path && file.kind === "file" && file.sha256 === sha256))
		throw invalidInput("path", "Register a stable file that Git tracks or does not ignore.");
	const document: Omit<EvidenceArtifact, "current"> = {
		id: ulid(),
		runId: input.runId,
		attemptId: selected.attemptId,
		path,
		sha256,
		bytes: info.size,
		head: state.head,
		fingerprint: state.fingerprint,
		createdAt: new Date().toISOString(),
	};
	await ctx.newTx(async (tx) => {
		const latest = await target(ctx.core, tx, { ...input, mutation: true });
		if (latest.attemptId !== selected.attemptId)
			throw invalidInput("runId", "The agent attempt changed before this artifact was registered.");
		await tx.execute(
			sql`INSERT INTO evidence_artifacts (id, run_id, attempt_id, path, document, created_at) VALUES (${document.id}, ${input.runId}, ${selected.attemptId}, ${path}, ${JSON.stringify(document)}::jsonb, ${document.createdAt})`,
		);
	});
	const after = await revision(selected.workspace);
	return { ...document, current: after.fingerprint === state.fingerprint };
};
