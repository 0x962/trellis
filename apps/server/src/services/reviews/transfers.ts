import { createHash } from "node:crypto";
import type { ReviewImport, ReviewRevision, ReviewThread } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import type { ServiceCtx } from "../support";
import { changed, ensurePr, findPr } from "./queries";
import { history } from "./submissions";

export async function importMargin(ctx: ServiceCtx, tx: Tx, input: ReviewImport) {
	const result = {
		imported: 0,
		skipped: 0,
		conflicts: [] as { pr: string; id: string }[],
		mapping: [] as { pr: string; legacyId: string; id: string }[],
	};
	for (const file of input.files) {
		const pr = input.dryRun ? await findPr(tx, file.url) : await ensurePr(tx, file.url);
		for (const legacy of file.comments) {
			const hash = createHash("sha256").update(JSON.stringify(legacy)).digest("hex");
			const [previous] = await rows<{ hash: string; thread_id: string }>(
				tx,
				sql`SELECT hash, thread_id FROM review_imports WHERE source = ${input.source} AND pr_id = ${pr?.id ?? ""} AND legacy_id = ${legacy.id}`,
			);
			if (previous) {
				if (previous.hash === hash) result.skipped++;
				else result.conflicts.push({ pr: file.url, id: legacy.id });
				result.mapping.push({ pr: file.url, legacyId: legacy.id, id: previous.thread_id });
				continue;
			}
			result.imported++;
			if (input.dryRun) continue;
			const id = ulid();
			const thread: ReviewThread = {
				...legacy,
				id,
				prId: pr!.id,
				kind: "unknown",
				session: legacy.session ?? null,
				version: 1,
				reactions: [],
				startLine: legacy.startLine ?? legacy.line,
				revisionId: null,
				resolvedBy: legacy.resolvedBy ?? null,
				resolvedAt: legacy.resolvedAt ?? null,
				replies: legacy.replies.map((r) => ({
					...r,
					id: ulid(),
					session: r.session ?? null,
					kind: "unknown",
					updatedAt: r.createdAt,
					version: 1,
					reactions: [],
				})),
			};
			await tx.execute(
				sql`INSERT INTO review_threads (id, pr_id, document, updated_at) VALUES (${id}, ${pr!.id}, ${JSON.stringify(thread)}::jsonb, ${thread.updatedAt})`,
			);
			const messages = [
				{ legacyId: legacy.id, id },
				...legacy.replies.map((r, i) => ({ legacyId: r.id, id: thread.replies[i]!.id })),
			];
			for (const message of messages) {
				await tx.execute(
					sql`INSERT INTO review_imports (id, source, legacy_id, pr_id, thread_id, hash) VALUES (${message.id}, ${input.source}, ${message.legacyId}, ${pr!.id}, ${id}, ${hash})`,
				);
				result.mapping.push({ pr: file.url, ...message });
			}
		}
		if (!input.dryRun) await changed(ctx, tx, pr!.id);
	}
	return result;
}
export async function exportReview(ctx: ServiceCtx, tx: Tx, input: { pr: string }) {
	const pr = await findPr(tx, input.pr);
	const threads = await rows<{ document: ReviewThread }>(
		tx,
		sql`SELECT document FROM review_threads WHERE pr_id = ${pr?.id ?? ""} ORDER BY id`,
	);
	const revisions = await rows<{ document: ReviewRevision }>(
		tx,
		sql`SELECT document FROM review_revisions WHERE pr_id = ${pr?.id ?? ""} ORDER BY id`,
	);
	return {
		version: 1 as const,
		url: pr?.url ?? input.pr,
		threads: threads.map((r) => r.document),
		revisions: revisions.map((r) => r.document),
		submissions: await history(ctx, tx, input),
		imports: await rows(
			tx,
			sql`SELECT source, legacy_id, id, thread_id, hash FROM review_imports WHERE pr_id = ${pr?.id ?? ""}`,
		),
	};
}
