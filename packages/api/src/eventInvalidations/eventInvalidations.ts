import type { TrellisEvent } from "../events.ts";
import { family, forTicket, type Matcher, ticketDetail } from "../invalidationCoalescer.ts";

type InvalidatingEvent = Exclude<
	TrellisEvent,
	{ type: "ticket.created" | "ticket.updated" | "ticket.deleted" | "reset" | "ready" | "bye" }
>;

export function eventInvalidations(event: InvalidatingEvent): Matcher[] {
	switch (event.type) {
		case "attachment.created":
		case "attachment.deleted":
			return [forTicket(["attachments", "list"], event.ticketId), ...ticketDetail(event.ticketId)];
		case "notes.changed":
			return [family("notes")];
		// A ticket row copies the name and the ref of its epic and of its
		// wave, and the projects list carries `openEpicCount`. No
		// ticket event follows a change of an epic or of a wave, so
		// every query that holds a ticket row refetches.
		case "epics.changed":
			return [family("epics"), family("tickets"), family("projects", "list")];
		case "pages.changed":
			return [family("pages"), family("projects", "list"), family("search")];
		case "providers.changed":
			return [family("providers")];
		case "page-comments.changed":
			return [family("pages"), family("pageComments"), family("needsYou"), family("projects", "list")];
		case "page-watches.changed":
			return [family("pages"), family("pageWatches")];
		case "page-pins.changed":
			return [family("pages"), family("pagePins")];
		case "resource-comments.changed":
			return [family("resourceComments")];
		// The Diffs page of a project lists pull requests by their ticket
		// links, so a link change refetches that list too.
		case "pr.linked":
		case "pr.unlinked":
		case "pr.updated":
			return [
				...event.ticketIds.flatMap((ticketId) => [
					forTicket(["pullRequests", "list"], ticketId),
					...ticketDetail(ticketId),
				]),
				family("tickets", "list"),
				family("tickets", "board"),
				family("reviews", "prs"),
				family("reviews", "status"),
				family("reviews", "metadata"),
			];
		// Every cached summary holds the name, the color, and the group name
		// of each label on its ticket. A rename, a new color, a move to a
		// group, or a delete alters those values, and no ticket row changes,
		// so no ticket event follows. So every query that holds a summary
		// refetches with the label list.
		case "labels.changed":
			return [family("labels"), family("tickets"), family("search"), family("needsYou")];
		// A status rename or a color change alters the `status` inside
		// every cached summary. No ticket row changes, so no ticket event
		// follows. A project rename alters
		// `project.path` the same way. So every query that holds a summary
		// refetches.
		case "statuses.changed":
		case "project.created":
		case "project.updated":
		case "project.deleted":
		case "project.moved":
			return [family("statuses"), family("projects"), family("tickets"), family("search"), family("needsYou")];
		case "needs-you.changed":
			return [family("needsYou")];
		case "gh.status":
			return [family("system", "gh")];
		// A session detail carries the state of its run, so a run change
		// refetches the sessions with the runs.
		case "agent-runs.status":
			// Status events arrive when any agent starts or finishes a tool.
			// Workspace counts use their own refresh interval and turn changes.
			return [
				family("agentRuns", "list"),
				family("agentRuns", "activity"),
				family("agentRuns", "broadcastRecipients"),
				family("agentRuns", "ticketMetrics"),
				...["session", "output", "terminalOutput"].map((procedure) => ({
					path: ["agentRuns", procedure],
					input: { id: event.activity.run.id },
				})),
				...["workspace", "file"].map((procedure) => ({
					path: ["agentRuns", procedure],
					input: { runId: event.activity.run.id },
				})),
				family("sessions"),
			];
		case "agent-runs.changed":
			return [family("agentRuns"), family("sessions")];
		case "sessions.changed":
			return [family("sessions")];
		case "session-updates.changed":
			return [family("sessionUpdates")];
		case "reviews.changed":
			return [family("reviews")];
		// A flow run stores its state under flowExecutions, and every state
		// write emits flows.changed with the flow id.
		case "flows.changed":
			return [family("flows"), family("flowExecutions")];
	}
}
