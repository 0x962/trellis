import type { Db } from "../client.ts";

export const collisionActors = ["1388e47d569e56c860147663319fc836", "47364f1656759b480d825dac62cbdf66"] as const;

export const actorConsumerIdentitySql = `
ALTER TABLE "flow_executions" DROP CONSTRAINT "flow_executions_actor_request_unique";
ALTER TABLE "flow_executions" ADD CONSTRAINT "flow_executions_actor_request_identity" EXCLUDE USING hash ((ARRAY["actor_kind", "actor_name", "request_id"]) WITH =);
ALTER TABLE "langflow_executions" DROP CONSTRAINT "langflow_start_actor_request";
ALTER TABLE "langflow_executions" ADD CONSTRAINT "langflow_start_actor_request_identity" EXCLUDE USING hash ((ARRAY["actor_kind", "actor_name", "request_id"]) WITH =);
ALTER TABLE "langflow_start_receipts" DROP CONSTRAINT "langflow_start_receipts_actor_kind_actor_name_request_id_pk";
ALTER TABLE "langflow_start_receipts" ADD CONSTRAINT "langflow_start_receipts_identity" EXCLUDE USING hash ((ARRAY["actor_kind", "actor_name", "request_id"]) WITH =);
DROP INDEX "native_migrations_request_idx";
ALTER TABLE "native_migrations" ADD CONSTRAINT "native_migrations_request_identity" EXCLUDE USING hash ((ARRAY["actor_name", "request_id"]) WITH =);
ALTER TABLE "needs_you_states" DROP CONSTRAINT "needs_you_states_actor_name_item_id_pk";
ALTER TABLE "needs_you_states" ADD CONSTRAINT "needs_you_states_identity" EXCLUDE USING hash ((ARRAY["actor_name", "item_id"]) WITH =);
ALTER TABLE "review_submissions" DROP CONSTRAINT "review_submissions_request";
ALTER TABLE "review_submissions" ADD CONSTRAINT "review_submissions_request_identity" EXCLUDE USING hash ((ARRAY["pr_id", "actor", "request_id"]) WITH =);
`;

export async function applyActorConsumerIdentitySql(db: Db) {
	await db.$client.exec(actorConsumerIdentitySql);
}

export async function cloneRow(db: Db, table: string, where: string, patch: Record<string, unknown>) {
	const columns = (
		await db.$client.query<{ name: string }>(
			`SELECT attname AS name FROM pg_attribute
			WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped AND attgenerated=''
			ORDER BY attnum`,
			[table],
		)
	).rows
		.map(({ name }) => `"${name}"`)
		.join(",");
	return db.$client.query(
		`INSERT INTO "${table}" (${columns})
		SELECT ${columns} FROM jsonb_populate_record(NULL::"${table}",
		(SELECT to_jsonb(t) FROM "${table}" t WHERE ${where}) || $1::jsonb)`,
		[JSON.stringify(patch)],
	);
}
