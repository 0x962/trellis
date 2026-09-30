import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";

export const prCount = 1600;
export const longIdentity = Array.from({ length: 256 }, (_, i) =>
	createHash("sha256").update(`review-identity-${i}`).digest("hex"),
).join("");

export async function seed(tx: Tx) {
	await tx.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('Human reviewer', 'human', '2026-09-01', '2026-09-01'),
			('Agent reviewer', 'agent', '2026-09-01', '2026-09-01'),
			('System reviewer', 'system', '2026-09-01', '2026-09-01'),
			(${longIdentity}, 'human', '2026-09-01', '2026-09-01')`);
	await tx.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, title, state, is_draft, local_state, review_retained,
		 additions, deletions, changed_files, files, head_sha, head_ref, base_ref, mergeable,
		 checks, ci_state, created_at, updated_at)
		SELECT 'pr-' || lpad(i::text, 4, '0'), 'fixture', 'reviews', i,
			'https://github.com/fixture/reviews/pull/' || i, 'Review ' || i,
			CASE i % 3 WHEN 0 THEN 'open' WHEN 1 THEN 'closed' ELSE 'merged' END,
			i % 2 = 0, CASE i % 2 WHEN 0 THEN 'ready' ELSE 'not-ready' END, true,
			i, i % 10, 0, '[]', 'head-' || i, 'feature-' || i, 'main', 'mergeable',
			'[]', 'none', '2026-09-01', '2026-09-01'::timestamptz + i * interval '1 second'
		FROM generate_series(1, ${prCount}) i`);
	await tx.execute(sql`INSERT INTO review_submissions (id, pr_id, request_id, actor, document, created_at)
		SELECT 'history-' || p.id || '-' || j, p.id, 'history-' || j,
			CASE p.number % 8 WHEN 1 THEN 'Agent reviewer' ELSE 'Human reviewer' END,
			jsonb_build_object('verdict', CASE p.number % 8 WHEN 1 THEN 'approved' ELSE 'commented' END,
				'body', 'Complete history α ' || j, 'threadIds', '[]'::jsonb),
			'2026-09-01'::timestamptz + j * interval '1 second'
		FROM pull_requests p CROSS JOIN generate_series(1, 10) j WHERE p.number % 8 <> 0`);
	await tx.execute(sql`INSERT INTO review_submissions (id, pr_id, request_id, actor, document, created_at)
		SELECT p.id || '-' || s.suffix, p.id,
			CASE s.kind WHEN 7 THEN ${longIdentity} ELSE s.suffix END,
			CASE s.kind WHEN 7 THEN ${longIdentity} ELSE s.actor END,
			jsonb_build_object('verdict', s.verdict, 'body', 'Retain exact body α', 'threadIds', '[]'::jsonb),
			'2026-09-01'::timestamptz + s.day * interval '1 day'
		FROM pull_requests p JOIN (VALUES
			(3, 'human', 'Human reviewer', 'approved', 1),
			(3, 'agent', 'Agent reviewer', 'changes_requested', 2),
			(3, 'comment', 'Human reviewer', 'commented', 3),
			(3, 'system', 'System reviewer', 'changes_requested', 4),
			(3, 'unknown', 'Unregistered reviewer', 'changes_requested', 5),
			(4, 'approved', 'Human reviewer', 'approved', 1),
			(4, 'changes', 'Human reviewer', 'changes_requested', 2),
			(5, 'tie-z', 'Human reviewer', 'changes_requested', 1),
			(5, 'tie-a', 'Human reviewer', 'approved', 1),
			(6, 'older-z', 'Human reviewer', 'changes_requested', 1),
			(6, 'newer-a', 'Human reviewer', 'approved', 2),
			(7, 'long-identity', 'Human reviewer', 'approved', 1)
		) s(kind, suffix, actor, verdict, day) ON p.number % 8 = s.kind`);
	await tx.execute(sql`INSERT INTO review_threads (id, pr_id, document, updated_at)
		SELECT 'thread-' || p.id, p.id,
			jsonb_build_object('status', CASE p.number % 2 WHEN 0 THEN 'open' ELSE 'resolved' END),
			p.updated_at FROM pull_requests p WHERE p.number % 4 = 0`);
	await tx.execute(sql`ANALYZE`);
}
