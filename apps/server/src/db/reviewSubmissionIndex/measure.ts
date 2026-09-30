import { sql } from "drizzle-orm";
import { type PullRequestRow, pullRequestColumns, toPullRequest } from "../queries/pullRequestRows.ts";
import { rows } from "../queries/support.ts";
import type { Tx } from "../tx.ts";

const query = sql`SELECT ${pullRequestColumns} FROM pull_requests p ORDER BY p.id`;

type Plan = {
	"Node Type": string;
	"Relation Name"?: string;
	"Index Name"?: string;
	"Actual Loops": number;
	Plans?: Plan[];
};

export async function measure(tx: Tx) {
	await rows<PullRequestRow>(tx, query);
	const elapsedMs: number[] = [];
	let result: PullRequestRow[] = [];
	for (let i = 0; i < 3; i++) {
		const start = performance.now();
		result = await rows<PullRequestRow>(tx, query);
		elapsedMs.push(performance.now() - start);
	}
	const [explained] = await rows<{ "QUERY PLAN": { Plan: Plan; "Execution Time": number }[] }>(
		tx,
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
	);
	const plan = explained!["QUERY PLAN"][0]!;
	const nodes: Plan[] = [];
	const visit = (node: Plan) => {
		nodes.push(node);
		for (const child of node.Plans ?? []) visit(child);
	};
	visit(plan.Plan);
	return { result: result.map(toPullRequest), elapsedMs, plan, nodes };
}
