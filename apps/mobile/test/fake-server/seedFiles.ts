import { createHash } from "node:crypto";
import type { CheckBucket, ReviewState } from "@trellis/api";
import { seedAttachmentBytes } from "./seedAttachmentBytes";
import { type ActorName, actors, day } from "./seeder";
import { newId, type State, type TicketRow } from "./state";

// The rows a seeded ticket carries beside its own: its pull request and its
// attachments. `ago` turns a number of milliseconds into the instant that
// many before the seed reading.
export const seedFiles = (state: State, ago: (ms: number) => string) => {
	const addPr = (
		row: TicketRow,
		number: number,
		title: string,
		headRef: string,
		checks: [string, CheckBucket][],
		reviewState: ReviewState,
		at: number,
		actor: ActorName,
	) => {
		const id = newId();
		const isFailing = checks.some(([, bucket]) => bucket === "fail" || bucket === "cancel");
		const isPending = checks.some(([, bucket]) => bucket === "pending");
		state.prs.set(id, {
			id,
			owner: "canary-technologies-corp",
			repo: "de",
			number,
			url: `https://github.com/canary-technologies-corp/de/pull/${number}`,
			title,
			state: "open",
			isDraft: false,
			headRef,
			baseRef: "main",
			reviewState,
			mergedAt: null,
			closedAt: null,
			checks: checks.map(([name, bucket]) => ({
				name,
				workflow: "ci",
				bucket,
				link: `https://github.com/canary-technologies-corp/de/actions/runs/${number}`,
			})),
			ciState: isFailing ? "fail" : isPending ? "pending" : "pass",
			fetchedAt: ago(at),
			fetchError: null,
			createdAt: ago(at + day),
			updatedAt: ago(at),
		});
		state.prLinks.push({ ticketId: row.id, prId: id, source: "manual", linkedBy: actors[actor], linkedAt: ago(at) });
	};

	const addAttachment = (
		row: TicketRow,
		filename: string,
		mime: string,
		size: number,
		actor: ActorName,
		at: number,
	) => {
		const id = newId();
		const bytes = seedAttachmentBytes(mime, size);
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		state.attachments.set(id, {
			id,
			ticketId: row.id,
			filename,
			mime,
			size,
			sha256,
			actor: actors[actor],
			createdAt: ago(at),
			url: `/api/attachments/${id}/file`,
		});
		state.blobs.set(sha256, bytes);
	};

	return { addPr, addAttachment };
};
