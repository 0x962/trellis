import { Button } from "../../primitives/Button";
import { ChoiceGroup, type ChoiceGroupOption } from "../../primitives/ChoiceGroup";
import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";
import { Textarea } from "../../primitives/Textarea";
import { TicketLine, type TicketRef } from "../TicketLine";

// One numbered choice of a question. The description of the ticket prints
// the number, and the person answers with it.
export type QuestionChoice = {
	number: number;
	text: string;
};

// The choice the author of the question prefers. `by` is the name that wrote
// it, such as an agent name, and `reason` is the sentences under the label.
export type QuestionRecommendation = {
	option: number;
	by: string | null;
	reason: string;
};

export type QuestionBlockProps = {
	choices: readonly QuestionChoice[];
	recommendation: QuestionRecommendation | null;
	// The tickets that start once this question has an answer.
	releases: readonly TicketRef[];
	// The choice the person picked, or null while none is picked.
	option: number | null;
	onOptionChange: (option: number) => void;
	reason: string;
	onReasonChange: (reason: string) => void;
	// True while the server writes the answer. `Answer` shows a turning ring
	// and takes no second click.
	answering: boolean;
	// One sentence that says what the answer did, once the server took it.
	// The block keeps the choice and the reason on screen under it.
	result: string | null;
	// Why the last answer failed, in the words of the server.
	error: string | null;
	onAnswer: () => void;
};

const recommendationNote = (by: string | null) => (by === null ? "Recommended." : `${by} recommends this one.`);

const recommendationLabel = (recommendation: QuestionRecommendation) =>
	recommendation.by === null
		? `Why option ${recommendation.option} is recommended`
		: `Why ${recommendation.by} recommends ${recommendation.option}`;

// The question a person answers: the numbered choices, the recommendation
// under its choice, the reason for it, the tickets the answer starts, and
// one `Answer`. The block never writes the word `decide`.
export function QuestionBlock({
	choices,
	recommendation,
	releases,
	option,
	onOptionChange,
	reason,
	onReasonChange,
	answering,
	result,
	error,
	onAnswer,
}: QuestionBlockProps) {
	if (choices.length === 0) {
		return (
			<section aria-label="The question" className="flex min-w-0 flex-col">
				<SectionHeader title="THE QUESTION" />
				<EmptyState description="The ticket lists no option to pick." />
			</section>
		);
	}
	const options: ChoiceGroupOption<string>[] = choices.map((choice) => ({
		value: String(choice.number),
		label: `${choice.number}. ${choice.text}`,
		description: recommendation?.option === choice.number ? recommendationNote(recommendation.by) : "",
	}));
	return (
		<section aria-label="The question" className="flex min-w-0 flex-col gap-4">
			<div className="flex min-w-0 flex-col">
				<SectionHeader title="THE QUESTION" />
				<ChoiceGroup
					className="-mx-3 mt-1"
					label="The options of this question"
					options={options}
					value={option === null ? "" : String(option)}
					onValueChange={(value) => onOptionChange(Number(value))}
				/>
			</div>
			{recommendation !== null && recommendation.reason !== "" && (
				<div className="flex min-w-0 flex-col gap-1">
					<h3 className="text-xs font-medium text-fg-faint">{recommendationLabel(recommendation)}</h3>
					<p className="text-sm text-fg">{recommendation.reason}</p>
				</div>
			)}
			{releases.length > 0 && (
				<div className="flex min-w-0 flex-col">
					<SectionHeader level={3} title="THIS ANSWER RELEASES" />
					{releases.map((release) => (
						<TicketLine key={release.identifier} {...release} />
					))}
				</div>
			)}
			<div className="flex min-w-0 flex-col gap-2">
				<SectionHeader level={3} title="YOUR ANSWER" />
				<Textarea
					label="Your reason"
					hideLabel
					rows={2}
					value={reason}
					placeholder="Your reason, one or two sentences"
					disabled={answering}
					onChange={(event) => onReasonChange(event.target.value)}
				/>
				<div className="flex min-w-0 items-center gap-3">
					<Button
						variant="primary"
						processing={answering}
						disabled={option === null || reason.trim() === ""}
						onClick={onAnswer}
					>
						Answer
					</Button>
					{result !== null && (
						<p role="status" className="min-w-0 text-sm text-fg-muted">
							{result}
						</p>
					)}
				</div>
				{error !== null && (
					<p role="alert" className="text-sm text-danger">
						{error}
					</p>
				)}
			</div>
		</section>
	);
}
