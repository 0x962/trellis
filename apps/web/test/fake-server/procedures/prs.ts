import type { PullRequest } from "@trellis/api";
import { fail } from "../fail";
import { os } from "../implementer";
import { emitPr } from "../prEvents";
import { identifierOf, isoNow, newId, requireTicket, requireWritable, type State } from "../state";
import { linkedPrs } from "../summaries";

// The one URL shape gh accepts: the owner, the repository, and the number.
export const prUrl = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/([1-9][0-9]*)$/;

// Link and refresh calls fail while gh is missing or signed out.
const requireGh = (state: State) => {
	if (!state.gh.ok) throw fail("GH_UNAVAILABLE", { reason: state.gh.reason ?? "error" });
};

export const pullRequests = {
	list: os.pullRequests.list.handler(({ context, input }) =>
		linkedPrs(context.state, requireTicket(context.state, input.ticket).id),
	),
	link: os.pullRequests.link.handler(({ context, input }) => {
		const ticket = requireTicket(context.state, input.ticket);
		requireWritable(context.state, ticket.projectId);
		const match = prUrl.exec(input.url);
		if (match === null) throw fail("INVALID_PR_URL", undefined);
		requireGh(context.state);
		const held = linkedPrs(context.state, ticket.id).find((row) => row.url === input.url);
		if (held !== undefined) return held;
		const now = isoNow();
		const pr: PullRequest = {
			id: newId(),
			owner: match[1]!,
			repo: match[2]!,
			number: Number(match[3]),
			url: input.url,
			title: `Pull request #${match[3]}`,
			state: "open",
			isDraft: false,
			headRef: identifierOf(context.state, ticket).toLowerCase(),
			baseRef: "main",
			reviewState: "none",
			mergedAt: null,
			closedAt: null,
			checks: [],
			ciState: "none",
			fetchedAt: now,
			fetchError: null,
			createdAt: now,
			updatedAt: now,
		};
		context.state.prs.set(pr.id, pr);
		context.state.prLinks.push({
			ticketId: ticket.id,
			prId: pr.id,
			source: "manual",
			linkedBy: context.actor!,
			linkedAt: now,
		});
		emitPr(context.state, context.bus, "pr.linked", pr);
		return { ...pr, source: "manual" as const, linkedBy: context.actor!, linkedAt: now };
	}),
	unlink: os.pullRequests.unlink.handler(({ context, input }) => {
		const ticket = requireTicket(context.state, input.ticket);
		context.state.prLinks = context.state.prLinks.filter(
			(link) => !(link.ticketId === ticket.id && link.prId === input.id),
		);
		return { deleted: input.id };
	}),
	refresh: os.pullRequests.refresh.handler(({ context, input }) => {
		requireGh(context.state);
		const stored = context.state.prs.get(input.id)!;
		const refreshed: PullRequest = { ...stored, fetchedAt: isoNow(), fetchError: null };
		context.state.prs.set(refreshed.id, refreshed);
		emitPr(context.state, context.bus, "pr.updated", refreshed);
		return refreshed;
	}),
	// margin renders the diff, so the web client never asks for one.
	diff: os.pullRequests.diff.handler(() => {
		throw fail("GH_UNAVAILABLE", { reason: "missing" });
	}),
};
