import type { SessionObserverMessage, SessionObserverMessageInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { iso, rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export type AppendSessionObserverMessagesInput = {
	observerId: string;
	generation: number;
	messages: SessionObserverMessageInput[];
	createdAt: Date;
};

export const appendSessionObserverMessages = async (
	tx: Tx,
	input: AppendSessionObserverMessagesInput,
): Promise<SessionObserverMessage[]> => {
	await tx.execute(sql`SELECT run_id FROM session_observers WHERE observer_id=${input.observerId} FOR UPDATE`);
	const [last] = await rows<{ position: number }>(
		tx,
		sql`SELECT coalesce(max(position), -1)::int AS position FROM session_observer_messages
		WHERE observer_id=${input.observerId} AND generation=${input.generation}`,
	);
	const saved: SessionObserverMessage[] = [];
	for (const [offset, message] of input.messages.entries()) {
		const position = last!.position + offset + 1;
		const [row] = await rows<SessionObserverMessage>(
			tx,
			sql`INSERT INTO session_observer_messages (id, observer_id, generation, position, role, body, created_at)
			VALUES (${ulid()}, ${input.observerId}, ${input.generation}, ${position}, ${message.role}, ${message.body}, ${input.createdAt})
			RETURNING id, observer_id AS "observerId", generation, position, role, body,
			${iso(sql`created_at`)} AS "createdAt"`,
		);
		saved.push(row!);
	}
	return saved;
};
