import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type SQL, sql } from "drizzle-orm";
import { migrate } from "../../migrate";
import { openTestDbFromArchive } from "../../testDb";
import type { Tx } from "../../tx";
import { rows } from "../support";
import { beforeIndex } from "./fixtures/beforeIndex";
import { concurrentRequest } from "./fixtures/concurrentRequest";
import { oracle } from "./fixtures/oracle";
import { seed } from "./fixtures/seed";
import { query } from "./query";

type Plan = {
	"Node Type": string;
	"Relation Name"?: string;
	"Index Name"?: string;
	"Actual Rows": number;
	"Actual Loops": number;
	Plans?: Plan[];
};
type Explain = { Plan: Plan; "Execution Time": number };
const nodes = (plan: Plan): Plan[] => [plan, ...(plan.Plans ?? []).flatMap(nodes)];
const explain = async (tx: Tx, statement: SQL) => {
	const [result] = await rows<{ "QUERY PLAN": Explain[] }>(
		tx,
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`,
	);
	return result!["QUERY PLAN"][0]!;
};
const contents = async (tx: Tx) => {
	const tables = ["flow_executions", "flow_execution_tasks", "agent_runs", "agent_execution_attempts"];
	const hashes = [];
	for (const table of tables) {
		const [row] = await rows<{ count: number; hash: string }>(
			tx,
			sql`
			SELECT count(*)::integer AS count, md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY row_to_json(t)::text)) AS hash
			FROM ${sql.identifier(table)} t`,
		);
		hashes.push({ table, ...row });
	}
	const constraints = await rows(
		tx,
		sql`SELECT conname, pg_get_constraintdef(oid) AS definition
		FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname,definition`,
	);
	return { hashes, constraints };
};

test("migration preserves data and keeps history out of concurrent tick requests", async () => {
	let db = await beforeIndex();
	try {
		await db.transaction((tx) =>
			seed(tx, {
				history: 12_000,
				cases: [
					{ id: "active", status: "running", steps: [], tasks: [{ open: true, result: false }] },
					{ id: "waiting", status: "waiting", steps: [], tasks: [] },
					{ id: "stop", status: "canceled", steps: [{ needsStop: true }], tasks: [{ open: true, result: false }] },
					{
						id: "stop-closed",
						status: "failed",
						steps: [{ needsStop: true }],
						tasks: [{ open: false, result: false }],
					},
					{ id: "stop-orphan", status: "succeeded", steps: [{ needsStop: true }], tasks: [] },
					{ id: "settled", status: "succeeded", steps: [], tasks: [{ open: true, result: true }] },
					{ id: "failed", status: "failed", steps: [], tasks: [{ open: true, result: false }] },
					{ id: "closed", status: "succeeded", steps: [], tasks: [{ open: false, result: true }] },
					{ id: "canceled", status: "canceled", steps: [], tasks: [{ open: true, result: false }] },
				],
			}),
		);
		await db.execute(sql`ANALYZE`);
		const before = await db.transaction(contents);
		const baseline = await concurrentRequest(db, oracle);
		const baselinePlan = await db.transaction((tx) => explain(tx, oracle));
		expect(await migrate(db)).toBe(1);
		expect(await db.transaction(contents)).toEqual(before);
		const indexedPlan = await db.transaction((tx) => explain(tx, query));
		const indexedNodes = nodes(indexedPlan.Plan);
		expect(indexedNodes.filter((n) => n["Node Type"] === "Seq Scan")).toEqual([]);
		expect(indexedNodes.filter((n) => n["Node Type"] === "Function Scan")).toEqual([]);
		for (const index of ["flow_executions_reconcile_idx", "agent_runs_open_idx", "flow_execution_tasks_run_idx"])
			expect(indexedNodes.some((n) => n["Index Name"] === index)).toBe(true);
		const samples = [];
		for (let i = 0; i < 7; i++) {
			const sample = await concurrentRequest(db, query);
			expect(sample.candidates).toEqual(baseline.candidates);
			expect(sample.ticket).toEqual([{ title: "Read this ticket" }]);
			expect(sample.heldMs).toBeLessThan(1_000);
			expect(sample.requestMs).toBeLessThan(1_000);
			samples.push({ heldMs: sample.heldMs, requestMs: sample.requestMs });
		}
		const archive = await db.$client.dumpDataDir("none");
		await db.$client.close();
		db = await openTestDbFromArchive(archive);
		const restart = await concurrentRequest(db, query);
		expect(restart.candidates).toEqual(baseline.candidates);
		expect(restart.heldMs).toBeLessThan(1_000);
		expect(restart.requestMs).toBeLessThan(1_000);
		const restartedPlan = await db.transaction((tx) => explain(tx, query));
		expect(nodes(restartedPlan.Plan).filter((n) => n["Node Type"] === "Seq Scan")).toEqual([]);
		const report = {
			dataset: before.hashes,
			constraintCount: before.constraints.length,
			candidates: baseline.candidates,
			candidateSha256: createHash("sha256").update(JSON.stringify(baseline.candidates)).digest("hex"),
			baseline: { heldMs: baseline.heldMs, requestMs: baseline.requestMs, plan: baselinePlan },
			indexed: { samples, plan: indexedPlan },
			restart: { heldMs: restart.heldMs, requestMs: restart.requestMs, plan: restartedPlan },
		};
		console.log(JSON.stringify({ baselineMs: baseline.heldMs, samples, restartMs: restart.heldMs }));
		if (process.env.TRELLIS_FLOW_CANDIDATE_PROOF)
			await writeFile(
				join(process.env.TRELLIS_FLOW_CANDIDATE_PROOF, "candidate-proof.json"),
				JSON.stringify(report, null, 2),
			);
	} finally {
		await db.$client.close();
	}
}, 60_000);
