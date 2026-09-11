import type { ActorRef, CheckBucket, Priority } from "@trellis/api";
import { ulid } from "ulid";
import type { ServiceTransport } from "../../../../server/src/db/transport.ts";
import type { GhStubHandle } from "../../../../server/test/helpers/gh-stub.ts";

// The parts a seed step needs: the transport the services run behind, the
// instant the seed calls "now", and the gh stub that answers a pull request
// link.

export const minute = 60_000;
export const hour = 60 * minute;
export const day = 24 * hour;

export const dana: ActorRef = { name: "dana", kind: "human" };
export const claude: ActorRef = { name: "claude-code", kind: "agent" };
export const codex: ActorRef = { name: "codex", kind: "agent" };

export const actors = { dana, claude, codex };
export type ActorName = keyof typeof actors;

export const ticketTemplate = "## Goal\n\n## Acceptance\n\n- [ ] \n";

// The repository every seeded pull request lives in.
export const PR_OWNER = "acme";
export const PR_REPO = "web";

export type PrSpec = {
	number: number;
	title: string;
	headRef: string;
	checks: Array<[string, CheckBucket]>;
	review: "REVIEW_REQUIRED" | "APPROVED" | "CHANGES_REQUESTED" | null;
};

// The gh conclusion behind each bucket. A pending check is a run GitHub has
// not finished, so it carries no conclusion.
const conclusions: Record<CheckBucket, string | null> = {
	pass: "SUCCESS",
	fail: "FAILURE",
	cancel: "CANCELLED",
	skipping: "SKIPPED",
	pending: null,
};

// The `gh api graphql` body for one pull request, under the alias the
// poller's query gives the first ref.
export const prReplyBody = (pr: PrSpec) => ({
	data: {
		pr0: {
			pullRequest: {
				number: pr.number,
				title: pr.title,
				state: "OPEN",
				isDraft: false,
				url: `https://github.com/${PR_OWNER}/${PR_REPO}/pull/${pr.number}`,
				headRefName: pr.headRef,
				baseRefName: "main",
				mergedAt: null,
				closedAt: null,
				reviewDecision: pr.review,
				commits: {
					nodes: [
						{
							commit: {
								statusCheckRollup: {
									contexts: {
										nodes: pr.checks.map(([name, bucket]) => ({
											__typename: "CheckRun",
											name,
											status: bucket === "pending" ? "IN_PROGRESS" : "COMPLETED",
											conclusion: conclusions[bucket],
											detailsUrl: `https://github.com/${PR_OWNER}/${PR_REPO}/actions/runs/${pr.number}`,
											checkSuite: { workflowRun: { event: "pull_request", workflow: { name: "ci" } } },
										})),
									},
								},
							},
						},
					],
				},
			},
		},
	},
});

export type TicketEvent =
	| { ago: number; actor: ActorName; move: string; force?: boolean }
	| { ago: number; actor: ActorName; comment: string }
	| { ago: number; actor: ActorName; pr: PrSpec }
	| { ago: number; actor: ActorName; attachment: { filename: string; mime: string; size: number } }
	| { ago: number; actor: ActorName; update: { priority?: Priority; parent?: string; title?: string } };

export type TicketSpec = {
	// The project path the ticket is created in.
	project: string;
	number: number;
	title: string;
	actor: ActorName;
	// Milliseconds before the seed instant for the create.
	ago: number;
	status?: string;
	priority?: Priority;
	parent?: number;
	description?: string;
	events?: TicketEvent[];
};

export type Seeder = {
	base: number;
	at: (ago: number) => Date;
	call: <T>(name: string, actor: ActorName | null, at: Date, input: unknown) => Promise<T>;
	// Arms the gh stub with the answer for the next pull request fetch.
	armPr: (pr: PrSpec) => void;
};

export const createSeeder = (transport: ServiceTransport, base: number, gh: GhStubHandle): Seeder => ({
	base,
	at: (ago: number) => new Date(base - ago),
	call: <T>(name: string, actor: ActorName | null, at: Date, input: unknown) =>
		transport.call(
			name as Parameters<ServiceTransport["call"]>[0],
			{ actor: actor === null ? null : actors[actor], session: null, reqId: ulid(), now: at },
			input,
		) as Promise<T>,
	armPr: (pr: PrSpec) => {
		gh.reply("api graphql", { stdout: JSON.stringify(prReplyBody(pr)), stderr: "", exitCode: 0 });
	},
});

// The bytes behind a seeded attachment. A PNG carries a real 8 by 8 header,
// so an image thumbnail decodes; every other type is filler of the exact
// size. The bytes follow from the mime and the size, so a restored row finds
// the same blob under the same hash.
const pngHeader = new Uint8Array([
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 8, 0, 0, 0, 8, 4, 0, 0, 0, 0, 36, 148, 12, 86,
	0, 0, 0, 14, 73, 68, 65, 84, 8, 215, 99, 152, 9, 4, 12, 132, 9, 0, 126, 183, 19, 33, 159, 141, 57, 118, 0, 0, 0, 0,
	73, 69, 78, 68, 174, 66, 96, 130,
]);

export const attachmentBytes = (mime: string, size: number): Uint8Array<ArrayBuffer> => {
	if (mime !== "image/png") return new TextEncoder().encode("a".repeat(size));
	const bytes = new Uint8Array(size);
	bytes.set(pngHeader);
	return bytes;
};
