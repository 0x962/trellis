import { currentVerdict, type ReviewDelivery, type ReviewSubmission } from "@trellis/api";

export type VerdictState = {
	id: string;
	// `note` is a comment of the person, shown when the person gave no verdict.
	kind: "approved" | "changes_requested" | "note";
	// True when the person gave a verdict. The bar then replaces Approve and
	// Request changes with Change verdict.
	current: boolean;
	headline: string;
	createdAt: string;
	delivery: string;
};

const headlines = {
	approved: "You approved",
	changes_requested: "You asked for changes",
} as const;

// A submission goes to each open agent assignment of the linked ticket. The
// best state of any one delivery names the whole submission.
export const deliveryWords = (deliveries: readonly ReviewDelivery[]) => {
	if (deliveries.length === 0) return "no agent run took it";
	if (deliveries.some((delivery) => delivery.readAt !== null)) return "the agent read it";
	if (deliveries.some((delivery) => delivery.state === "sent")) return "sent to the agent";
	if (deliveries.some((delivery) => delivery.state === "pending" || delivery.state === "sending"))
		return "sending to the agent";
	if (deliveries.some((delivery) => delivery.state === "failed")) return "delivery failed";
	return "delivery state unknown";
};

// The line the verdict bar shows above its buttons, or null when the person
// has submitted nothing on this pull request.
export const verdictState = (submissions: readonly ReviewSubmission[]): VerdictState | null => {
	const verdict = currentVerdict(submissions);
	if (verdict !== null) {
		const kind = verdict.verdict === "approved" ? "approved" : "changes_requested";
		return {
			id: verdict.id,
			kind,
			current: true,
			headline: headlines[kind],
			createdAt: verdict.createdAt,
			delivery: deliveryWords(verdict.deliveries),
		};
	}
	const note = submissions
		.filter((submission) => submission.byPerson)
		.reduce<ReviewSubmission | null>(
			(latest, submission) => (latest === null || submission.createdAt > latest.createdAt ? submission : latest),
			null,
		);
	if (note === null) return null;
	return {
		id: note.id,
		kind: "note",
		current: false,
		headline: "You commented",
		createdAt: note.createdAt,
		delivery: deliveryWords(note.deliveries),
	};
};
