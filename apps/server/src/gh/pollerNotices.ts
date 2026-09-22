import type { Check, CiState, PrState } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../db/queries/support.ts";
import { type Tx, withTx } from "../db/tx.ts";
import { enqueueCheckDeliveries } from "../services/reviews/enqueueCheckDeliveries.ts";
import { agentsOf } from "../services/reviews/enqueueReviewDeliveries.ts";
import { decideNotice, type NoticeDecision, type StoredNotice } from "./checkNotice.ts";
import { failureLines } from "./failureLines.ts";
import type { GhRunner } from "./run.ts";

// The last step of every poller tick: it reads the stored checks of each open
// pull request, decides with `decideNotice` whether the agents of its
// tickets must hear about a change, and queues that notice. The step reads
// the rows the poll just wrote and makes no GitHub call of its own, except
// one annotations read per failed check that a new failed notice names.

type Db = Parameters<typeof withTx>[0];

// A failed notice reads the output of at most this many checks, so a matrix
// of 40 failed jobs costs 3 gh calls and not 40.
export const MAX_CHECKS_WITH_LINES = 3;

type Subject = {
	id: string;
	owner: string;
	repo: string;
	state: PrState;
	headSha: string | null;
	ciState: CiState;
	checks: Check[];
	checksChangedAt: string | null;
	notices: StoredNotice[];
};

type Due = { subject: Subject; decision: NoticeDecision };

// Every open pull request whose checks changed since the detector exists,
// with its notices oldest first.
const selectSubjects = (tx: Tx) =>
	rows<Subject>(
		tx,
		sql`SELECT p.id, p.owner, p.repo, p.state, p.head_sha AS "headSha", p.ci_state AS "ciState", p.checks,
			${iso(sql`p.checks_changed_at`)} AS "checksChangedAt",
			coalesce((SELECT jsonb_agg(jsonb_build_object('headSha', n.head_sha, 'kind', n.kind, 'checks', n.checks)
				ORDER BY n.created_at, n.id) FROM check_notices n WHERE n.pr_id = p.id), '[]'::jsonb) AS notices
		FROM pull_requests p
		WHERE p.state = 'open' AND p.checks_changed_at IS NOT NULL
		ORDER BY p.id`,
	);

// The decisions for pull requests that an agent holds. A pull request that
// no agent holds sends nothing, so it costs no annotations read either.
const selectDue = async (tx: Tx, at: Date): Promise<Due[]> => {
	const due: Due[] = [];
	for (const subject of await selectSubjects(tx)) {
		const decision = decideNotice(subject, subject.notices, at.getTime());
		if (decision === null) continue;
		if ((await agentsOf(tx, subject.id)).length === 0) continue;
		due.push({ subject, decision });
	}
	return due;
};

const withLines = async (gh: GhRunner, { subject, decision }: Due): Promise<Due> => {
	if (decision.kind !== "failed") return { subject, decision };
	const checks = [];
	for (const [index, check] of decision.checks.entries())
		checks.push(
			index < MAX_CHECKS_WITH_LINES ? { ...check, lines: await failureLines(gh, subject, check.link) } : check,
		);
	return { subject, decision: { ...decision, checks } };
};

export const noticeChecks = async (db: Db, gh: GhRunner, at: Date) => {
	const { result: due } = await withTx(db, (tx) => selectDue(tx, at));
	const filled: Due[] = [];
	for (const entry of due) filled.push(await withLines(gh, entry));
	await withTx(db, async (tx) => {
		for (const { subject, decision } of filled)
			await enqueueCheckDeliveries(tx, {
				prId: subject.id,
				headSha: subject.headSha!,
				kind: decision.kind,
				checks: decision.checks,
				at,
			});
	});
};
