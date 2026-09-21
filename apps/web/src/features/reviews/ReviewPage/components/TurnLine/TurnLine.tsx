import type { TicketPr, Turn } from "@trellis/api";

export type TurnLineProps = {
	// Who acts next on the pull request, from `turnOf`.
	turn: Turn;
	// The pull request row of the ticket. It holds the count that explains
	// the turn.
	prRow: TicketPr | null;
	// The day GitHub merged the pull request, as 2026-09-18, or `null` while
	// the pull request is open.
	mergedOn: string | null;
};

const countPhrase = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

// Why the holder of the turn has it. The page prints the first fact that
// fits, in the order an agent clears them.
const reasonOf = (prRow: TicketPr | null): string | null => {
	if (prRow === null) return null;
	if (prRow.fail > 0) return `${countPhrase(prRow.fail, "check", "checks")} failed`;
	if (prRow.openThreads > 0) return `${countPhrase(prRow.openThreads, "comment", "comments")} open`;
	if (prRow.pending > 0) return `${countPhrase(prRow.pending, "check", "checks")} pending`;
	return null;
};

const turnOpening: Record<Turn, string> = {
	you: "Your turn",
	agent: "The agent's turn",
	github: "GitHub's turn",
	ready: "Ready to start",
	"waits on a merge": "Waits on a merge",
	done: "Done",
};

// A merged pull request ends the review, whatever the ticket of the pull
// request still waits for.
export function turnSentence({ turn, prRow, mergedOn }: TurnLineProps): string {
	if (mergedOn !== null) return `Merged ${mergedOn}.`;
	const reason = turn === "agent" || turn === "github" ? reasonOf(prRow) : null;
	return reason === null ? `${turnOpening[turn]}.` : `${turnOpening[turn]}. ${reason}.`;
}

// Who acts next on the pull request, in one sentence.
export function TurnLine(props: TurnLineProps) {
	return (
		<p className="review-turn-line" role="status" aria-live="polite">
			{turnSentence(props)}
		</p>
	);
}
