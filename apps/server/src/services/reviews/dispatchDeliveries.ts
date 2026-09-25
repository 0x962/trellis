import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { type SQL, sql } from "drizzle-orm";
import { nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import { CONFLICT_NOTICE_KINDS } from "../../db/tables/checkNotices.ts";
import type { Tx } from "../../db/tx.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { launchState } from "../agentRuns/launchState";
import { sendDeadline } from "../deliveries/sendDeadline.ts";
import {
	otherRuntime,
	ownAuthor,
	pullRequestEnded,
	supersededCheck,
	unconfirmedDelivery,
	waitedTooLong,
	waitingForRun,
} from "../deliveries/sentences.ts";
import type { IoCtx } from "../support.ts";
import { storedAuthor, writtenBy } from "./deliveryAuthor.ts";
import { deliveryMessageId } from "./deliveryMessageId.ts";
import { prOfDelivery } from "./deliveryPullRequest.ts";
import { report } from "./deliveryReport.ts";
import { pendingDeliveries } from "./pendingDeliveries";
import { changed } from "./queries.ts";
import { openAssignment, readyDelivery } from "./ticketRun.ts";

const list = (values: string[]) =>
	sql.join(
		values.map((value) => sql`${value}`),
		sql`,`,
	);
const due = sql`delivery.due_at <= now()`;

// A message that waits and a message that is due both leave this step when
// Trellis will never send them.
const waiting = sql`delivery.state IN ('pending', 'held')`;

// A check notice leaves only while it still describes the pull request. A
// notice that a newer notice of the same family or a new head commit
// replaced fails, so the agent never reads an old result. The merge family
// holds `conflict` and `clear`, and a check result never replaces a merge
// result.
const mergeFamily = (notice: SQL) => sql`(${notice}.kind IN (${list([...CONFLICT_NOTICE_KINDS])}))`;

const dropStaleCheckDeliveries = (tx: Tx) =>
	rows<{ id: string }>(
		tx,
		sql`UPDATE review_deliveries delivery SET state = 'failed', error = ${supersededCheck}
		FROM check_notices notice, pull_requests pr
		WHERE delivery.check_notice_id = notice.id AND pr.id = notice.pr_id AND ${waiting}
			AND (pr.head_sha IS DISTINCT FROM notice.head_sha
				OR EXISTS (SELECT 1 FROM check_notices newer WHERE newer.pr_id = notice.pr_id
					AND ${mergeFamily(sql`newer`)} = ${mergeFamily(sql`notice`)}
					AND (newer.created_at, newer.id) > (notice.created_at, notice.id)))
		RETURNING delivery.id`,
	);

// A message never returns to the agent that wrote it. The agent of a ticket
// can change between the moment a comment joins the queue and the moment it
// leaves, so this step reads the author of the message and the run that
// holds the ticket now. `writtenBy` states when those two are one agent. A
// check notice and a merge notice carry no author, so they always travel.
const dropOwnAuthorDeliveries = (tx: Tx) =>
	rows<{ id: string }>(
		tx,
		sql`UPDATE review_deliveries delivery SET state = 'failed', error = ${ownAuthor}
		FROM agent_runs run
		WHERE ${waiting} AND ${openAssignment(sql`run`, sql`delivery.ticket_id`)}
			AND ${writtenBy(storedAuthor, sql`run`)}
		RETURNING delivery.id`,
	);

// A message of a pull request that merged or closed has no reader, whatever
// kind it is.
const dropEndedPullRequestDeliveries = (tx: Tx) =>
	rows<{ id: string }>(
		tx,
		sql`UPDATE review_deliveries delivery SET state = 'failed', error = ${pullRequestEnded}
		WHERE ${waiting}
			AND EXISTS (SELECT 1 FROM pull_requests pr WHERE pr.id = ${prOfDelivery} AND pr.state <> 'open')
		RETURNING delivery.id`,
	);

// The longest time a message waits for an agent of its ticket. `due_at` is
// the moment the message joined the queue, so the limit counts from there.
export const WAIT_LIMIT_HOURS = 24;

// A message that waited the whole limit leaves the queue. The work of the
// pull request has moved on by then, and the person reads the page.
const dropOldDeliveries = (tx: Tx) =>
	rows<{ id: string }>(
		tx,
		sql`UPDATE review_deliveries delivery SET state = 'failed', error = ${waitedTooLong}
		WHERE ${waiting} AND delivery.due_at < now() - make_interval(hours => ${WAIT_LIMIT_HOURS})
		RETURNING delivery.id`,
	);

// Trellis writes into the terminal of a run that it starts itself. A ticket
// whose open run belongs to another program takes no message, and the row
// says which program that is. No such message waits in silence.
const dropOtherRuntimeDeliveries = async (tx: Tx) => {
	const found = await rows<{ id: string; runtime: string }>(
		tx,
		sql`SELECT delivery.id, run.runtime FROM review_deliveries delivery
		JOIN agent_runs run ON ${openAssignment(sql`run`, sql`delivery.ticket_id`)}
		WHERE ${waiting} AND run.runtime <> 'native'
		ORDER BY delivery.id`,
	);
	const byRuntime = new Map<string, string[]>();
	for (const row of found) byRuntime.set(row.runtime, [...(byRuntime.get(row.runtime) ?? []), row.id]);
	for (const [runtime, ids] of byRuntime)
		await tx.execute(
			sql`UPDATE review_deliveries SET state = 'failed', error = ${otherRuntime(runtime)}
			WHERE id IN (${list(ids)})`,
		);
	return byRuntime;
};

// The terminals of the runs that Trellis is starting now. Such a run has no
// session yet, and its messages stay in the queue, because its terminal
// answers in a moment.
const startingTerminals = async (tx: Tx, home: string) => {
	const found = await rows<{ terminalId: string }>(
		tx,
		sql`SELECT DISTINCT run.terminal_id AS "terminalId" FROM review_deliveries delivery
		JOIN agent_runs run ON ${openAssignment(sql`run`, sql`delivery.ticket_id`)}
		WHERE ${waiting} AND run.terminal_id IS NOT NULL`,
	);
	return found.filter((row) => launchState.has(home, row.terminalId)).map((row) => row.terminalId);
};

// A message waits in `held` until its assigned agent can receive it.
const holdDeliveries = (tx: Tx, terminals: string[], idleTerminals: string[]) =>
	rows<{ id: string }>(
		tx,
		sql`UPDATE review_deliveries delivery SET state = 'held', error = ${waitingForRun}
		WHERE delivery.state = 'pending' AND ${due} AND NOT ${readyDelivery(terminals, idleTerminals)}
		RETURNING delivery.id`,
	);

const releaseDeliveries = (tx: Tx, terminals: string[], idleTerminals: string[]) =>
	rows<{ id: string }>(
		tx,
		sql`UPDATE review_deliveries delivery SET state = 'pending', error = NULL
		WHERE delivery.state = 'held' AND ${readyDelivery(terminals, idleTerminals)}
		RETURNING delivery.id`,
	);

const outcomeOf = (failure: unknown) => {
	const text = failure instanceof Error ? failure.message : String(failure);
	return text === unconfirmedDelivery ? { state: "unknown", error: text } : { state: "failed", error: text };
};

// Runtime observations select live recipients and idle agents that a new comment or a CI result can resume.
export const dispatchDeliveries = async (
	ctx: IoCtx,
	sessions: RuntimeProcessStatus[],
	send = prepareSend,
	preset = nativePreset,
) => {
	const ready = sessions
		.filter((session) => session.status === "running" && session.controllable)
		.map((session) => session.id);
	const idle = sessions
		.filter((session) => session.status === "exited" && session.stopReason === "idle")
		.map((session) => session.id);
	const moved = await ctx.newTx(async (tx) => {
		const drop = async (ids: string[], reason: string) => report(ctx, tx, "delivery dropped", ids, { reason });
		const dropped = [
			...(await drop(
				(await dropStaleCheckDeliveries(tx)).map((row) => row.id),
				supersededCheck,
			)),
			...(await drop(
				(await dropOwnAuthorDeliveries(tx)).map((row) => row.id),
				ownAuthor,
			)),
			...(await drop(
				(await dropEndedPullRequestDeliveries(tx)).map((row) => row.id),
				pullRequestEnded,
			)),
			...(await drop(
				(await dropOldDeliveries(tx)).map((row) => row.id),
				waitedTooLong,
			)),
		];
		for (const [runtime, ids] of await dropOtherRuntimeDeliveries(tx))
			dropped.push(...(await drop(ids, otherRuntime(runtime))));
		const released = await report(
			ctx,
			tx,
			"delivery released",
			(await releaseDeliveries(tx, ready, idle)).map((row) => row.id),
		);
		const starting = await startingTerminals(tx, ctx.home);
		const held = await report(
			ctx,
			tx,
			"delivery held",
			(await holdDeliveries(tx, [...ready, ...starting], idle)).map((row) => row.id),
		);
		return [...dropped, ...released, ...held];
	});
	// The review page draws the state of each message, so every page that
	// shows one of these pull requests reads the new word.
	for (const prId of new Set(moved.map((row) => row.prId))) await ctx.newTx((tx) => changed(ctx, tx, prId));
	if (ready.length === 0 && idle.length === 0) return;
	const pending = await ctx.newTx((tx) => pendingDeliveries(tx, ready, idle));
	const resumed = new Set<string>();
	for (const delivery of pending) {
		const resumesIdle = idle.includes(delivery.terminalId);
		// Resume replaces the attempt ID. The next pass reads that ID before it sends another notice.
		if (resumesIdle && resumed.has(delivery.runId)) continue;
		const claimed = await ctx.newTx((tx) =>
			rows<{ id: string }>(
				tx,
				sql`UPDATE review_deliveries SET state = 'sending', run_id = ${delivery.runId}
				WHERE id IN (${list(delivery.ids)}) AND state = 'pending' RETURNING id`,
			),
		);
		if (claimed.length === 0) continue;
		if (resumesIdle) resumed.add(delivery.runId);
		let outcome: { state: string; error: string | null } = { state: "sent", error: null };
		try {
			const interrupt = (await preset(ctx.home, delivery.terminalId)) !== "custom";
			const message = send(ctx, {
				id: delivery.runId,
				interrupt,
				text: delivery.text,
				messageId: deliveryMessageId(delivery.ids[0]!),
				expectedTerminalId: delivery.terminalId,
				expectedSessionId: delivery.sessionId,
			});
			// A resume waits for the provider's startup confirmation, which can exceed the live send deadline.
			await (resumesIdle ? message : sendDeadline(message));
		} catch (failure) {
			outcome = outcomeOf(failure);
		}
		const ids = claimed.map((row) => row.id);
		await ctx.newTx(async (tx) => {
			await tx.execute(
				sql`UPDATE review_deliveries SET state = ${outcome.state}, error = ${outcome.error}
				WHERE id IN (${list(ids)})`,
			);
			await report(ctx, tx, `delivery ${outcome.state}`, ids, { run: delivery.runId, error: outcome.error });
		});
		// The review page draws the state of each comment, so the page that
		// waits for this send learns the new word.
		if (delivery.prId) await ctx.newTx((tx) => changed(ctx, tx, delivery.prId!));
	}
};
