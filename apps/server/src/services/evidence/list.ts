import type { EvidenceArtifact, EvidenceCheck } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import { revision } from "./revision.ts";
import { target } from "./target.ts";
import type { EvidenceCtx } from "./types.ts";

export const list = async (ctx: EvidenceCtx, input: { runId: string }) => {
	const selected = await ctx.newTx((tx) => target(ctx.core, tx, input));
	const stored = await ctx.newTx(async (tx) => ({
		checks: await rows<{ document: Omit<EvidenceCheck, "historical"> }>(
			tx,
			sql`SELECT document FROM evidence_checks WHERE run_id = ${input.runId} ORDER BY created_at DESC, id DESC LIMIT 100`,
		),
		artifacts: await rows<{ document: Omit<EvidenceArtifact, "current"> }>(
			tx,
			sql`SELECT document FROM evidence_artifacts WHERE run_id = ${input.runId} ORDER BY created_at DESC, id DESC LIMIT 100`,
		),
	}));
	const state = await revision(selected.workspace);
	const checks = stored.checks.map(({ document }) => ({ ...document, historical: true as const }));
	const hashes = new Map(state.files.map((file) => [file.path, file.sha256]));
	const artifacts = stored.artifacts.map(({ document }) => ({
		...document,
		current:
			document.attemptId === selected.attemptId &&
			document.head === state.head &&
			document.fingerprint === state.fingerprint &&
			hashes.get(document.path) === document.sha256,
	}));
	return {
		head: state.head,
		fingerprint: state.fingerprint,
		checks,
		artifacts,
	};
};
