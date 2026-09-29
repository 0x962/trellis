import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { protocolDigest } from "../../langflowContracts/index.ts";
import type { Db } from "../client.ts";
import { reserveExecution } from "../queries/langflowExecution/executions.ts";
import { receiptFixture } from "../queries/langflowExecution/fixtures/fixture.ts";
import { collisionActors } from "./fixture.ts";

let db: Db;
let base: Awaited<ReturnType<typeof receiptFixture>>["input"];

beforeAll(async () => {
	const fixture = await receiptFixture(false);
	db = fixture.db;
	base = fixture.input;
	await db.$client.exec(`
		ALTER TABLE "langflow_executions" ADD CONSTRAINT "langflow_start_actor_request_identity"
			EXCLUDE USING hash ((ARRAY["actor_kind", "actor_name", "request_id"]) WITH =);
		ALTER TABLE "langflow_start_receipts" ADD CONSTRAINT "langflow_start_receipts_identity"
			EXCLUDE USING hash ((ARRAY["actor_kind", "actor_name", "request_id"]) WITH =);
	`);
});

afterAll(async () => db.$client.close());

test("Langflow reservations retain complete and colliding actor identities", async () => {
	const completeActors = [randomBytes(2048).toString("hex"), randomBytes(8192).toString("hex")];
	expect(completeActors.map((actor) => actor.length)).toEqual([4096, 16384]);
	for (const [index, actorName] of [...completeActors, ...collisionActors].entries()) {
		const executionId = `actor-execution-${index}`;
		const requestId = index < 2 ? `long-request-${index}` : "collision-request";
		const requestBytes = `request-${index}`;
		const input = {
			...base,
			executionId,
			actorName,
			requestId,
			requestBytes,
			submission: {
				...base.submission,
				executionId,
				requestId,
				actor: { kind: "human" as const, name: actorName },
				requestDigest: protocolDigest(requestBytes),
			},
		};
		const first = await db.transaction((tx) => reserveExecution(tx, input));
		const replay = await db.transaction((tx) => reserveExecution(tx, input));
		expect(replay.executionId).toBe(first.executionId);
	}
	const executions = await db.$client.query(
		"SELECT actor_name FROM langflow_executions WHERE request_id='collision-request' ORDER BY actor_name",
	);
	const receipts = await db.$client.query(
		"SELECT actor_name FROM langflow_start_receipts WHERE request_id='collision-request' ORDER BY actor_name",
	);
	const expected = collisionActors.map((actor_name) => ({ actor_name }));
	expect(executions.rows).toEqual(expected);
	expect(receipts.rows).toEqual(expected);
});
