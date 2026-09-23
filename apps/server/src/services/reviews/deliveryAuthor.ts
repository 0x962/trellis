import { type SQL, sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import type { ActorRef } from "../support.ts";

// Who wrote one message that waits for an agent. `name` and `kind` are the
// actor of the call that wrote the comment, the reply or the verdict.
// `runId` names the row of `agent_runs` that wrote it. `runId` is null for
// a person, for a check notice, and for an agent that Trellis did not
// start.
export type MessageAuthor = { name: string; kind: string; runId: string | null };

// The author of a message that this actor writes. Trellis starts a native
// agent with the actor name `agent:<the identifier of the run>`, so a row
// of `agent_runs` that carries that identifier is the run that wrote the
// message. An agent can also name itself with `trellis review add
// --author <name>`, and then no run carries that name as an identifier.
export const messageAuthor = async (tx: Tx, actor: ActorRef): Promise<MessageAuthor> => {
	if (actor.kind !== "agent") return { name: actor.name, kind: actor.kind, runId: null };
	const [found] = await rows<{ id: string }>(tx, sql`SELECT id FROM agent_runs WHERE id = ${actor.name}`);
	return { name: actor.name, kind: actor.kind, runId: found?.id ?? null };
};

// The three values of one author inside a query.
type AuthorSql = { name: SQL; kind: SQL; runId: SQL };

// The author columns of the `review_deliveries` row that the query names
// `delivery`.
export const storedAuthor: AuthorSql = {
	name: sql`delivery.author_name`,
	kind: sql`delivery.author_kind`,
	runId: sql`delivery.author_run_id`,
};

// The author of a message that no row of `review_deliveries` holds yet. A
// message with no author, such as a check notice or a merge notice, passes
// null.
export const givenAuthor = (author: MessageAuthor | null): AuthorSql => ({
	name: sql`${author?.name ?? null}::text`,
	kind: sql`${author?.kind ?? null}::text`,
	runId: sql`${author?.runId ?? null}::text`,
});

// True when the agent run that the query names `run` wrote the message.
// Three facts each say so:
//
// 1. The run that wrote the message is this run. A resume keeps the row of
//    `agent_runs`, so this fact holds after a resume.
// 2. The actor name of the author is the name of this run. An agent that
//    names itself with `--author` writes its own name and not the
//    identifier of its run.
// 3. The run that wrote the message sat on the ticket of this run and
//    carried the same name. A person who starts an agent again on the same
//    ticket gets a second row of `agent_runs` with the same name, and this
//    fact carries the identity of that agent across the two rows.
//
// Fact 3 asks for the same ticket, so a comment that an agent named `claude`
// writes on one ticket still reaches an agent named `claude` on another
// ticket.
export const writtenBy = (author: AuthorSql, run: SQL) =>
	sql`coalesce(${author.kind} = 'agent' AND (
		${author.runId} = ${run}.id
		OR ${author.name} = ${run}.name
		OR EXISTS (SELECT 1 FROM agent_runs earlier
			WHERE earlier.id = ${author.runId}
				AND earlier.ticket_id = ${run}.ticket_id
				AND earlier.name = ${run}.name)), false)`;

// The three author columns that a queued message carries, and the values of
// one author for them.
export const authorColumns = sql`author_name, author_kind, author_run_id`;

export const authorValues = (author: MessageAuthor) => sql`${author.name}, ${author.kind}, ${author.runId}`;
