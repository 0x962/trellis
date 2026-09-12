import type { ReviewReply, ReviewThread } from "@trellis/api";

export function marginExport(input: { url: string; threads: ReviewThread[]; imports: Record<string, unknown>[] }) {
	const aliases = new Map(input.imports.map((row) => [String(row.id), String(row.legacy_id)]));
	const message = (row: ReviewReply, prefix: string) => ({
		id: aliases.get(row.id) ?? `${prefix}-${row.id}`,
		author: row.author,
		...(row.session === null ? {} : { session: row.session }),
		body: row.body,
		createdAt: row.createdAt,
	});
	return {
		url: input.url,
		comments: input.threads.map((thread) => ({
			...message(thread, "c"),
			path: thread.path,
			side: thread.side,
			line: thread.line,
			startLine: thread.startLine,
			status: thread.status,
			updatedAt: thread.updatedAt,
			...(thread.resolvedBy === null ? {} : { resolvedBy: thread.resolvedBy }),
			...(thread.resolvedAt === null ? {} : { resolvedAt: thread.resolvedAt }),
			replies: thread.replies.map((reply) => message(reply, "r")),
		})),
	};
}
