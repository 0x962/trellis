import { AttentionDot } from "../../primitives/AttentionDot";
import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";
import { BlockRow, NothingWord } from "../../review/BlockRow";
import { type StatusCategory, StatusIcon } from "../StatusIcon";
import { type TicketAnchor, TicketLine, type TicketRef } from "../TicketLine";

export type ChainDependency = {
	identifier: string;
	title: string;
	status: StatusCategory;
	// True when only a person finishes the ticket, because the ticket asks a
	// question and holds the answer options. Such a line carries the yellow
	// dot and the words `your answer`.
	isQuestion: boolean;
	link: TicketAnchor;
};

export type ChainRelease = TicketRef;

// One question this ticket waited for, and the option a person picked.
export type AnsweredQuestion = TicketRef & {
	option: number;
};

export type ChainBlockProps = {
	// The tickets that hold this one back. A ticket that is done is not in
	// this list.
	waitsOn: readonly ChainDependency[];
	// The tickets that this one holds back.
	releases: readonly ChainRelease[];
	// One sentence that says whether the work can start, and names each
	// ticket that holds it back. The caller derives it from `waitsOn`.
	ready: string;
	// The questions this ticket applies, after somebody answered them. Empty
	// while no answered question decides how the work is built.
	answeredQuestions: readonly AnsweredQuestion[];
};

// The words a screen reader says for the status mark of a chain line. A
// dependency carries the category of its status and not the name a project
// gives that status.
const statusWords: Record<StatusCategory, string> = {
	todo: "Not started",
	started: "In progress",
	review: "In review",
	done: "Done",
	canceled: "Canceled",
};

// The chain of one ticket: what holds it back, whether it can start, what it
// holds back, and the questions that decide how the work is built. Every
// sentence here reports a state. Nothing in this block starts a run or
// changes a ticket.
export function ChainBlock({ waitsOn, releases, ready, answeredQuestions }: ChainBlockProps) {
	// A question this ticket waits on decides how the ticket is built, so the
	// `Applies` line names it again with the word `open`. Once the question is
	// answered it leaves `waitsOn`, and the same row names the picked option.
	const open = waitsOn.filter((dependency) => dependency.isQuestion);
	const applies = open.length + answeredQuestions.length;
	if (waitsOn.length === 0 && releases.length === 0 && applies === 0) {
		return (
			<section aria-label="The chain" className="flex min-w-0 flex-col">
				<SectionHeader title="THE CHAIN" />
				<EmptyState description="The ticket waits for nothing, and no ticket waits for it." />
			</section>
		);
	}
	return (
		<section aria-label="The chain" className="flex min-w-0 flex-col">
			<SectionHeader title="THE CHAIN" />
			<dl className="flex min-w-0 flex-col">
				<BlockRow label="Waits on">
					{waitsOn.length === 0 ? (
						<NothingWord />
					) : (
						waitsOn.map((dependency) => (
							<TicketLine
								key={dependency.identifier}
								identifier={dependency.identifier}
								title={dependency.title}
								link={dependency.link}
								mark={<StatusIcon category={dependency.status} label={statusWords[dependency.status]} />}
								end={
									dependency.isQuestion && (
										<span className="flex shrink-0 items-center gap-1 text-fg-muted">
											<AttentionDot label={`${dependency.identifier} waits for your answer.`} />
											your answer
										</span>
									)
								}
							/>
						))
					)}
				</BlockRow>
				<BlockRow label="Ready">
					<span className="text-sm text-fg">{ready}</span>
				</BlockRow>
				<BlockRow label="Releases">
					{releases.length === 0 ? (
						<NothingWord />
					) : (
						releases.map((release) => <TicketLine key={release.identifier} {...release} />)
					)}
				</BlockRow>
				{applies > 0 && (
					<BlockRow label="Applies">
						{open.map((question) => (
							<TicketLine
								key={question.identifier}
								identifier={question.identifier}
								title={question.title}
								link={question.link}
								note="open."
							/>
						))}
						{answeredQuestions.map((question) => (
							<TicketLine
								key={question.identifier}
								identifier={question.identifier}
								title={question.title}
								link={question.link}
								lead="answered:"
								note={`chose ${question.option}.`}
							/>
						))}
					</BlockRow>
				)}
			</dl>
		</section>
	);
}
