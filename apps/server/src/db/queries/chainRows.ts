import type { StatusCategory } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { rows } from "./support.ts";

export type ChainRow = {
	identifier: string;
	title: string;
	status: StatusCategory;
	isQuestion: boolean;
	outcome: string;
};

// A ticket is a question when a person must answer it: a human reviewer, and a description that starts with an "Options:" list.
export const ticketQuestion = (ticket: SQL, status: SQL) =>
	sql`${status}.reviewer = 'human' AND ${ticket}.description ~ '(?ms)^Options:[[:space:]]*[^[:space:]]'`;

export const chainRows = (tx: Tx, ticketId: string) =>
	rows<ChainRow>(
		tx,
		sql`SELECT waits_root.key || '-' || blocker.number AS identifier,
			blocker.title, blocker_status.category AS status,
			${ticketQuestion(sql`blocker`, sql`blocker_status`)} AS "isQuestion",
			blocker.outcome
		FROM ticket_deps dependency
		JOIN tickets blocker ON blocker.id = dependency.depends_on_id
		JOIN statuses blocker_status ON blocker_status.id = blocker.status_id
		JOIN projects waits_root ON waits_root.id = blocker.root_id
		WHERE dependency.ticket_id = ${ticketId}
		ORDER BY blocker.number, blocker.id`,
	);
