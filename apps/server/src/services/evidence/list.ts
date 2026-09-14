import type { EvidenceArtifact, EvidenceCheck } from "@trellis/api";
import { sql } from "drizzle-orm";
import { nativeClient } from "../../agents/native/connection.ts";
import { rows } from "../../db/queries/support.ts";
import { currentCheck } from "./current.ts";
import { finishCheck } from "./finishCheck.ts";
import { revision } from "./revision.ts";
import { target } from "./target.ts";
import type { EvidenceCtx } from "./types.ts";

export const list = async (ctx: EvidenceCtx, input: { runId: string }) => {
	const selected = await ctx.newTx((tx) => target(ctx.core, tx, input));
	const stored = await ctx.newTx(async (tx) => ({
		checks: await rows<{ document: Omit<EvidenceCheck, "current"> }>(
			tx,
			sql`SELECT document FROM evidence_checks WHERE run_id = ${input.runId} ORDER BY created_at DESC, id DESC LIMIT 100`,
		),
		artifacts: await rows<{ document: Omit<EvidenceArtifact, "current"> }>(
			tx,
			sql`SELECT document FROM evidence_artifacts WHERE run_id = ${input.runId} ORDER BY created_at DESC, id DESC LIMIT 100`,
		),
	}));
	const completed = [];
	for (const { document } of stored.checks) {
		if (document.state !== "running") {
			completed.push(document);
			continue;
		}
		try {
			const session = (await nativeClient(ctx.home).list()).find((item) => item.id === document.id);
			completed.push(
				session?.status === "running"
					? document
					: await finishCheck(ctx, document, selected.workspace, session ?? null),
			);
		} catch (cause) {
			completed.push(
				await finishCheck(
					ctx,
					document,
					selected.workspace,
					null,
					cause instanceof Error ? cause.message : String(cause),
				),
			);
		}
	}
	const state = await revision(selected.workspace);
	const checks = completed.map((check) => currentCheck(check, { ...state, attemptId: selected.attemptId }));
	const hashes = new Map(state.files.map((file) => [file.path, file.sha256]));
	const artifacts = stored.artifacts.map(({ document }) => ({
		...document,
		current:
			document.attemptId === selected.attemptId &&
			document.head === state.head &&
			document.fingerprint === state.fingerprint &&
			hashes.get(document.path) === document.sha256,
	}));
	const [readiness] = await ctx.newTx((tx) =>
		rows<{ count: number; passed: boolean | null }>(
			tx,
			sql`
		SELECT count(*)::int AS count, bool_and(
			document->>'state' = 'passed'
			AND document->>'head' = ${state.head}
			AND document->>'fingerprint' = ${state.fingerprint}
			AND document->>'finishedFingerprint' = ${state.fingerprint}
		) AS passed
		FROM (
			SELECT DISTINCT ON (document->>'command', document->'args') document
			FROM evidence_checks WHERE run_id = ${input.runId} AND attempt_id = ${selected.attemptId}
			ORDER BY document->>'command', document->'args', created_at DESC, id DESC
		) latest
	`,
		),
	);
	return {
		head: state.head,
		fingerprint: state.fingerprint,
		checks,
		artifacts,
		readyForReview:
			artifacts.some((artifact) => artifact.current) && readiness!.count > 0 && readiness!.passed === true,
	};
};
