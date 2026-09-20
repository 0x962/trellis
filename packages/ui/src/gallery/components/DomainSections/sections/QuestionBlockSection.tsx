import { useState } from "react";
import { QuestionBlock, type QuestionOption, type RecommendedOption } from "../../../../domain/QuestionBlock";
import type { TicketRef } from "../../../../domain/TicketLine";
import { Section } from "../../Section";

// The gallery has no router, so a release line is a plain anchor here. A page
// passes a router Link. `TicketLine` replaces the children of the anchor with
// the content of the line, so the identifier below never reaches the screen.
const link = (identifier: string) => <a href={`/t/${identifier}`}>{identifier}</a>;

// OP-52 of section 2, screen 7 in
// docs/research/trellis-for-one-human-and-many-agents.md, verbatim.
const options: QuestionOption[] = [
	{ number: 1, text: "Leave it missed. Write a RoutineRun with a missed state so the person sees the gap." },
	{ number: 2, text: "Run it late. The sweep starts every due moment it finds, however old." },
	{ number: 3, text: "Run it late inside a wider grace, for example six hours, and leave older moments missed." },
];

// No record names the author of a recommendation today, so the web app passes
// `by: null` and the block prints `Recommended.`. The first card here holds a
// name to show the other form.
const recommendation: RecommendedOption = {
	option: 1,
	by: "crisp-fjord",
	reason:
		"A night audit that runs at 09:00 reads a different day than the one it was written for, and a backlog of late runs can hold the CronJob past its next tick.",
};

// OP-33 waits for this answer.
const releases: TicketRef[] = [
	{
		identifier: "OP-33",
		title: "Service: One routine's failure does not end the sweep pass",
		link: link("OP-33"),
	},
];

// The block is controlled, so the page that holds it holds the picked option
// and the reason. This gallery holds them too.
function Answerable({ by, result, error }: { by: string | null; result: string | null; error: string | null }) {
	const [picked, setPicked] = useState<number | null>(result === null ? null : 1);
	const [reason, setReason] = useState(result === null ? "" : "A missed night must stay visible.");
	return (
		<QuestionBlock
			options={options}
			recommendation={{ ...recommendation, by }}
			releases={releases}
			picked={picked}
			onPickedChange={setPicked}
			reason={reason}
			onReasonChange={setReason}
			answering={false}
			result={result}
			error={error}
			onAnswer={() => {}}
		/>
	);
}

export function QuestionBlockSection() {
	return (
		<Section
			name="QuestionBlock"
			note="OP-52 with a named author, with no author, with the answer it wrote, and with a refused answer"
		>
			<div className="w-full max-w-160">
				<Answerable by="crisp-fjord" result={null} error={null} />
			</div>
			<div className="w-full max-w-160">
				<Answerable by={null} result={null} error={null} />
			</div>
			<div className="w-full max-w-160">
				<Answerable by={null} result="OP-52 is done. crisp-fjord on OP-33 has the answer." error={null} />
			</div>
			<div className="w-full max-w-160">
				<Answerable by={null} result={null} error="This question lists options 1, 2, 3. Pick one of them." />
			</div>
		</Section>
	);
}
