import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";
import { type ServiceCtx as CoreCtx, SYSTEM_ACTOR } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import * as comments from "../comments.ts";
import { resolveTicket } from "../refs.ts";
import { slugOf } from "../slug.ts";
import type { ServiceCtx } from "../support.ts";
import { prepareStart } from "./agentRuns.ts";
import { closeExitedAssignments } from "./closeExitedAssignments.ts";
import { prepareSend } from "./communication.ts";
import { mentionSlugs } from "./mentionSlugs.ts";

type Ctx = ServiceCtx & { core: CoreCtx; localUrl: string };

// A comment body holds up to 200,000 characters, and the agentRuns.send
// route holds a follow-up to 20,000. The mention path calls the service
// behind that route, so it cuts the text to the same length before it
// sends it or puts it in a launch prompt.
const MAX_MENTION_TEXT = 20_000;

// The comment that holds the mention: its ticket, its id, and its body.
type MentionInput = { ticket: string; commentId: string; body: string };

// One comment from trellis itself, in the thread of the comment that holds
// the mention. comments.create moves a reply to a reply up to the root of
// its thread, so the person reads it beside the mention.
const reply = (ctx: Ctx, input: MentionInput, body: string) =>
	ctx.newTx((tx) =>
		comments.create({ ...ctx.core, actor: SYSTEM_ACTOR }, tx, {
			ticket: input.ticket,
			parentId: input.commentId,
			body,
		}),
	);

// What to tell the person who wrote the mention. A start that a rule
// refuses carries its sentence in the first validation issue, such as "Local
// work is paused. Resume local work in the desktop app before another
// start." Anything else carries its own message.
const refusalReason = (error: unknown) => {
	if (error instanceof ORPCError) {
		if (error.code === "INPUT_VALIDATION_FAILED") {
			const issues = (error.data as { issues: { message: string }[] }).issues;
			return issues[0]?.message ?? error.message;
		}
		// `reserve` refuses a start at the project concurrency limit with
		// DUPLICATE, and the contract text for that code is "A row with this
		// value exists." The `field` of the payload names what stopped it.
		if (error.code === "DUPLICATE") {
			const field = (error.data as { field: string }).field;
			return `The start passed the ${field}. Look at the agents on this ticket and its project before you mention the persona again.`;
		}
	}
	return error instanceof Error ? error.message : String(error);
};

type Target = { personaId: string; personaName: string; runId: string | null };
type Ambiguity = { slug: string; names: string[] };

const plan = async (ctx: Ctx, input: MentionInput, slugs: string[]) =>
	ctx.newTx(async (tx) => {
		const ticket = await resolveTicket(ctx.core, tx, input.ticket);
		const personas = await rows<{ id: string; name: string }>(tx, sql`SELECT id, name FROM personas`);
		// An open assignment is one that `reserve` counts against the project
		// concurrency limit. A mention reaches that run and does not start a
		// second one beside it. The newest open run wins, so the pick is the same
		// on every call.
		const live = await rows<{ id: string; persona_id: string | null }>(
			tx,
			sql`SELECT id, persona_id FROM agent_runs
			WHERE ticket_id = ${ticket.id} AND runtime = 'native' AND closed_at IS NULL
			ORDER BY created_at DESC, id DESC`,
		);
		const targets: Target[] = [];
		const ambiguous: Ambiguity[] = [];
		for (const slug of slugs) {
			const matches = personas.filter((persona) => slugOf(persona.name) === slug);
			if (matches.length === 0) continue;
			if (matches.length > 1) {
				ambiguous.push({ slug, names: matches.map((persona) => persona.name) });
				continue;
			}
			const persona = matches[0] as { id: string; name: string };
			const running = live.find((run) => run.persona_id === persona.id);
			targets.push({ personaId: persona.id, personaName: persona.name, runId: running?.id ?? null });
		}
		return { targets, ambiguous };
	});

// Starts or notifies every persona a comment mentions. The run a mention
// starts is the whole record of that mention. The comment is
// already committed when this runs, so a refused start never takes the
// comment down with it. Each refusal comes back as a reply on the ticket.
const act = async (ctx: Ctx, input: MentionInput) => {
	const slugs = mentionSlugs(input.body);
	if (slugs.length === 0) return { started: 0 };
	// A process that exited keeps its assignment open until this call closes
	// it. The mention then starts a new run in place of a send that fails.
	await closeExitedAssignments(ctx);
	const { targets, ambiguous } = await plan(ctx, input, slugs);
	for (const item of ambiguous) {
		await reply(
			ctx,
			input,
			`The mention @${item.slug} names ${item.names.length} personas: ${item.names.join(", ")}. trellis started no agent. Give the personas different names, or start the one you want from the ticket.`,
		);
	}
	const text = input.body.slice(0, MAX_MENTION_TEXT);
	let started = 0;
	for (const target of targets) {
		// A comment body is user input, so a mention it holds can break a rule
		// that a start enforces. The comment is saved already, and the reply
		// below is what tells the person why no agent came.
		try {
			if (target.runId === null)
				await prepareStart(ctx, {
					personaId: target.personaId,
					ticket: input.ticket,
					note: text,
					// One comment starts one persona once, when the call runs again.
					requestId: `mention-${input.commentId}-${target.personaId}`,
				});
			else await prepareSend(ctx, { id: target.runId, text });
			started += 1;
		} catch (error) {
			await reply(ctx, input, `trellis could not reach ${target.personaName}. ${refusalReason(error)}`);
		}
	}
	return { started };
};

// comments.create starts this call and does not wait for it, so a throw here
// would reach nobody: the comment answered already, and a procedure holds no
// logger. Every failure therefore leaves a reply on the ticket. `plan` and
// the replies sit outside the loop of `act`, so this is where a failure in
// either of them becomes a sentence a person reads. A ticket that no longer
// takes a comment takes no reply either, and that last case is the one this
// drops.
export const prepareMention = async (ctx: Ctx, input: MentionInput) => {
	try {
		return await act(ctx, input);
	} catch (error) {
		const reason = refusalReason(error);
		try {
			await reply(ctx, input, `trellis could not act on the mention in this comment. ${reason}`);
		} catch {
			return { started: 0 };
		}
		return { started: 0 };
	}
};

export const mention = (_ctx: Ctx, _tx: Tx, input: { started: number }) => Promise.resolve(input);
