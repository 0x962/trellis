import { useState } from "react";
import { QuestionBlock, type QuestionChoice, type QuestionRecommendation } from "../../../../domain/QuestionBlock";
import type { TicketRef } from "../../../../domain/TicketLine";
import { Section } from "../../Section";

// The gallery has no router, so a release line is a plain anchor here. A page
// passes a router Link. `TicketLine` replaces the children of the anchor with
// the content of the line, so the identifier below never reaches the screen.
const link = (identifier: string) => <a href={`/t/${identifier}`}>{identifier}</a>;

// OP-52 of section 2, screen 7 in
// docs/research/trellis-for-one-human-and-many-agents.md, verbatim.
const choices: QuestionChoice[] = [
	{ number: 1, text: "Leave it missed. Write a RoutineRun with a missed state so the person sees the gap." },
	{ number: 2, text: "Run it late. The sweep starts every due moment it finds, however old." },
	{ number: 3, text: "Run it late inside a wider grace, for example six hours, and leave older moments missed." },
];

const recommendation: QuestionRecommendation = {
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
function Answerable({ result, error }: { result: string | null; error: string | null }) {
	const [option, setOption] = useState<number | null>(result === null ? null : 1);
	const [reason, setReason] = useState(result === null ? "" : "A missed night must stay visible.");
	return (
		<QuestionBlock
			choices={choices}
			recommendation={recommendation}
			releases={releases}
			option={option}
			onOptionChange={setOption}
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
		<Section name="QuestionBlock" note="OP-52 with no option picked, the answer it wrote, and a refused answer">
			<div className="w-full max-w-160">
				<Answerable result={null} error={null} />
			</div>
			<div className="w-full max-w-160">
				<Answerable result="OP-52 is done. crisp-fjord on OP-33 has the answer." error={null} />
			</div>
			<div className="w-full max-w-160">
				<Answerable result={null} error="This question lists 3 options. Pick one of them." />
			</div>
		</Section>
	);
}
