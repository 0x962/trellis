import { sql } from "drizzle-orm";
import { bigint, check, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { DispatchPermit } from "../../../langflowHost/dispatchGate";

export const langflowActionReceipts = pgTable(
	"langflow_action_receipts",
	{
		permitId: text("permit_id").primaryKey(),
		effectId: text("effect_id").notNull(),
		permit: jsonb().$type<DispatchPermit>().notNull(),
		requestBytes: text("request_bytes").notNull(),
		requestDigest: text("request_digest").notNull(),
		outcome: text().$type<"completed" | "refused">().notNull().default("completed"),
		executionId: text("execution_id"),
		viewRevision: bigint("view_revision", { mode: "number" }),
		errorCode: text("error_code"),
		errorBytes: text("error_bytes"),
		receiptId: text("receipt_id").notNull(),
		recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
		sourceBytes: text("source_bytes").notNull(),
		sourceDigest: text("source_digest").notNull(),
	},
	(t) => [
		unique("langflow_action_effect").on(t.effectId),
		check(
			"langflow_action_outcome",
			sql`(${t.outcome} = 'completed' AND ${t.executionId} IS NOT NULL AND ${t.viewRevision} IS NOT NULL AND ${t.errorCode} IS NULL AND ${t.errorBytes} IS NULL) OR (${t.outcome} = 'refused' AND ${t.executionId} IS NULL AND ${t.viewRevision} IS NULL AND ${t.errorCode} IS NOT NULL AND length(${t.errorCode}) > 0 AND ${t.errorBytes} IS NOT NULL AND length(${t.errorBytes}) > 0)`,
		),
		check(
			"langflow_action_request_digest",
			sql`${t.requestDigest} = encode(sha256(convert_to(${t.requestBytes}, 'UTF8')), 'hex')`,
		),
		check(
			"langflow_action_source_digest",
			sql`${t.sourceDigest} = encode(sha256(convert_to(${t.sourceBytes}, 'UTF8')), 'hex')`,
		),
		check(
			"langflow_action_permit_binding",
			sql`${t.permit}->>'id' = ${t.permitId} AND ${t.permit}->'binding'->>'effectId' = ${t.effectId}`,
		),
	],
);
