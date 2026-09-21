import { Button } from "../../primitives/Button";
import { ChoiceGroup, type ChoiceGroupOption } from "../../primitives/ChoiceGroup";
import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";
import { Textarea } from "../../primitives/Textarea";
import { TicketLine, type TicketRef } from "../TicketLine";

// One numbered option of a question. The description of the ticket prints
// the number, and a person answers with it.
export type QuestionOption = {
	number: number;
	text: string;
};

// The option the author of the question prefers. `by` is the name that wrote
// it, and it is null while no record names an author. `reason` is the
// sentences under the label.
export type RecommendedOption = {
	option: number;
	by: string | null;
	reason: string;
};

export type QuestionBlockProps = {
	options: readonly QuestionOption[];
	recommendation: RecommendedOption | null;
	// The tickets that start once this question has an answer.
	releases: readonly TicketRef[];
	// The number of the option a person picked, or null while none is picked.
	picked: number | null;
	onPickedChange: (option: number) => void;
	reason: string;
	onReasonChange: (reason: string) => void;
	// True while the server writes the answer. `Answer` shows a turning ring
	// and takes no second click.
	answering: boolean;
	// One sentence that says what the answer did, once the server took it.
	// The block keeps the option and the reason on screen under it.
	result: string | null;
	// Why the last answer failed, in the words of the server.
	error: string | null;
	onAnswer: () => void;
};

const recommendationNote = (by: string | null) => (by === null ? "Recommended." : `${by} recommends this one.`);

const recommendationLabel = (recommendation: RecommendedOption) =>
	recommendation.by === null
		? `Why option ${recommendation.option} is recommended`
		: `Why ${recommendation.by} recommends ${recommendation.option}`;

export function QuestionBlock({
	options,
	recommendation,
	releases,
	picked,
	onPickedChange,
	reason,
	onReasonChange,
	answering,
	result,
	error,
	onAnswer,
}: QuestionBlockProps) {
	if (options.length === 0) {
		return (
			<section aria-label="The question" className="flex min-w-0 flex-col">
				<SectionHeader title="The question" textCase="caps" />
				<EmptyState description="The ticket lists no option to pick." />
			</section>
		);
	}
	const radioOptions: ChoiceGroupOption<string>[] = options.map((option) => ({
		value: String(option.number),
		label: `${option.number}. ${option.text}`,
		description: recommendation?.option === option.number ? recommendationNote(recommendation.by) : "",
	}));
	return (
		<section aria-label="The question" className="flex min-w-0 flex-col gap-4">
			<div className="flex min-w-0 flex-col">
				<SectionHeader title="The question" textCase="caps" />
				<ChoiceGroup
					className="-mx-3 mt-1"
					label="The options of this question"
					options={radioOptions}
					value={picked === null ? "" : String(picked)}
					onValueChange={(value) => onPickedChange(Number(value))}
				/>
			</div>
			{recommendation !== null && recommendation.reason !== "" && (
				<div className="flex min-w-0 flex-col">
					<SectionHeader level={3} title={recommendationLabel(recommendation)} textCase="caps" />
					<p className="text-sm text-fg">{recommendation.reason}</p>
				</div>
			)}
			{releases.length > 0 && (
				<div className="flex min-w-0 flex-col">
					<SectionHeader level={3} title="This answer releases" textCase="caps" />
					{releases.map((release) => (
						<TicketLine key={release.identifier} {...release} />
					))}
				</div>
			)}
			<div className="flex min-w-0 flex-col gap-2">
				<SectionHeader level={3} title="Your answer" textCase="caps" />
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
						disabled={picked === null || reason.trim() === ""}
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
