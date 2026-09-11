import type { Ticket } from "@trellis/api";
import type { ServiceTransport } from "../../../../server/src/db/transport.ts";
import type { GhStubHandle } from "../../../../server/test/helpers/gh-stub.ts";
import { fillerSpecs } from "./fillers.ts";
import { cdeNamedSpecs } from "./namedCde.ts";
import { otherNamedSpecs } from "./namedOthers.ts";
import {
	attachmentBytes,
	createSeeder,
	day,
	PR_OWNER,
	PR_REPO,
	type Seeder,
	type TicketSpec,
	ticketTemplate,
} from "./support.ts";

// The seed the web tests read. It is the data the design canvas shows, so a
// screenshot of the shell over it matches the approved screens.
//
// Actors: navid (human), claude-code (agent), codex (agent).
//
// Projects and their trees:
//   CDE "Superset CDE"   with CDE.web "web" and CDE.host "host"
//   TRL "trellis"
//   MRG "margin"
// Every root owns the six statuses a root is created with: Todo, In Progress,
// Agent Review, Human Review, Done, Canceled. Sub-projects inherit CDE's set.
//
// CDE holds the numbers 1 to 52, TRL 1 to 19, MRG 1 to 5. A ticket takes the
// next number of its root, so every spec is created in number order.
//
// Named tickets, with the story each one replays:
//   CDE-42 "Restore the fork pages after the upstream 1.27 merge" human-review,
//          high, parent CDE-43, 4 comments, 1 attachment, PR de#118 approved
//          with four passing checks; last change claude-code 2 h ago.
//   CDE-44 "Terminal pane loses scrollback on session handoff" in-progress,
//          urgent, PR de#121 with a failing typecheck; claude-code 9 min ago.
//   CDE-41 "Local Stack tab reads the live checkout from tmux" in-progress,
//          medium, parent CDE-43, 1 attachment; claude-code 3 h ago.
//   CDE-38 "Databases page: cancel button for long statements" in-progress,
//          medium; claude-code 2 days ago, which is stalled.
//   CDE-37 "Shell+ tabs survive an app restart" human-review, medium,
//          2 comments, PR de#115 with four passing checks; codex 5 h ago.
//   CDE-45 "Setup module skips a hand-run launchd agent" agent-review, high,
//          PR de#119; claude-code 14 min ago.
//   CDE-40 "Agent wrapper skips its own ~/.golemapp spelling" agent-review,
//          medium, 1 comment, PR de#117; codex 6 h ago.
//   CDE-43 "Merge upstream 1.27 and keep every marked site" in-progress, high,
//          PR de#116 with four pending checks; navid 41 min ago.
//   CDE-47 "Shell+ tab rename by double click" todo, low, 2 attachments.
//   CDE-48, CDE-49, CDE-33, CDE-34, TRL-7, TRL-8 were moved to Done by an
//   agent today, so the Needs you page lists six rows there.
//   TRL-9 "PR polling: one batched GraphQL query or per-PR REST calls"
//          human-review, low, parent TRL-4; claude-code 6 h ago.
//   TRL-4 "PR and CI polling" in-progress, medium; navid 20 h ago.
//   TRL-12 "OAuth device flow for the CLI sign-in" todo, urgent.

export type SeedOptions = { transport: ServiceTransport; gh: GhStubHandle; base: number };

// One change of the seed, with the instant it runs at.
type Step = { ago: number; order: number; run: () => Promise<void> };

const projectOrder = ["CDE", "TRL", "MRG"];

// Every ticket of the seed, in the order the numbers are handed out: root by
// root, number by number.
const allSpecs = (): TicketSpec[] => {
	const specs = [...fillerSpecs(), ...cdeNamedSpecs(), ...otherNamedSpecs()];
	const rootOf = (spec: TicketSpec) => spec.project.split(".")[0] as string;
	return specs.sort((a, b) => projectOrder.indexOf(rootOf(a)) - projectOrder.indexOf(rootOf(b)) || a.number - b.number);
};

const seedProjects = async (s: Seeder) => {
	const at = s.at(30 * day);
	const root = async (key: string, name: string) =>
		await s.call("projects.create", "navid", at, { key, name, ticketTemplate });
	const child = async (parent: string, slug: string, name: string) =>
		await s.call("projects.create", "navid", at, { parent, slug, name, ticketTemplate });
	await root("CDE", "Superset CDE");
	await child("CDE", "web", "web");
	await child("CDE", "host", "host");
	await root("TRL", "trellis");
	await root("MRG", "margin");
};

// The steps one ticket's story needs, after its create.
const stepsOf = (s: Seeder, spec: TicketSpec, identifier: string): Step[] => {
	const steps: Step[] = [];
	const push = (ago: number, run: () => Promise<void>) => steps.push({ ago, order: steps.length, run });
	// A parent with a higher number does not exist yet at the create, so the
	// link is written as the first change of the story.
	if (spec.parent !== undefined && spec.parent > spec.number) {
		push(spec.ago, async () => {
			await s.call("tickets.update", spec.actor, s.at(spec.ago), {
				ticket: identifier,
				parent: `${identifier.split("-")[0]}-${spec.parent}`,
			});
		});
	}
	for (const event of spec.events ?? []) {
		const at = s.at(event.ago);
		if ("move" in event) {
			push(event.ago, async () => {
				await s.call("tickets.move", event.actor, at, {
					ticket: identifier,
					status: event.move,
					...(event.force === true ? { force: true } : {}),
				});
			});
		} else if ("comment" in event) {
			push(event.ago, async () => {
				await s.call("comments.create", event.actor, at, { ticket: identifier, body: event.comment });
			});
		} else if ("update" in event) {
			push(event.ago, async () => {
				await s.call("tickets.update", event.actor, at, { ticket: identifier, ...event.update });
			});
		} else if ("attachment" in event) {
			push(event.ago, async () => {
				const { filename, mime, size } = event.attachment;
				const file = new File([attachmentBytes(mime, size)], filename, { type: mime });
				await s.call("attachments.upload", event.actor, at, { ticket: identifier, file });
			});
		} else {
			push(event.ago, async () => {
				s.armPr(event.pr);
				await s.call("pullRequests.link", event.actor, at, {
					ticket: identifier,
					url: `https://github.com/${PR_OWNER}/${PR_REPO}/pull/${event.pr.number}`,
				});
			});
		}
	}
	return steps;
};

// Creates every ticket in number order, then replays every change oldest
// first. The creates run out of time order, because the number order and the
// story order differ; every change after them is chronological, so each
// actor's last write is the last one its story names.
export const seedData = async ({ transport, gh, base }: SeedOptions) => {
	const s = createSeeder(transport, base, gh);
	await seedProjects(s);
	await s.call("settings.set", "navid", s.at(30 * day), {
		startWithAgentTemplate: 'claude "$(trellis brief {brief})"',
		defaultActorName: "navid",
		stalledHours: 24,
	});
	const steps: Step[] = [];
	for (const spec of allSpecs()) {
		const root = spec.project.split(".")[0] as string;
		const identifier = `${root}-${spec.number}`;
		const ticket = await s.call<Ticket>("tickets.create", spec.actor, s.at(spec.ago), {
			project: spec.project,
			title: spec.title,
			description: spec.description ?? `${spec.title}.\n\n${ticketTemplate}`,
			priority: spec.priority ?? "none",
			...(spec.status === undefined ? {} : { status: spec.status }),
			...(spec.parent !== undefined && spec.parent < spec.number ? { parent: `${root}-${spec.parent}` } : {}),
			force: true,
		});
		if (ticket.identifier !== identifier) {
			throw new Error(`the seed expected ${identifier} and the server gave ${ticket.identifier}`);
		}
		steps.push(...stepsOf(s, spec, identifier));
	}
	steps.sort((a, b) => b.ago - a.ago || a.order - b.order);
	for (const step of steps) await step.run();
};
