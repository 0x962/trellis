import { cloneElement, type ReactElement, type ReactNode } from "react";
import { AttentionDot } from "../../primitives/AttentionDot";
import { EmptyState } from "../../primitives/EmptyState";
import { PropertyRow } from "../../primitives/PropertyRow";
import { SectionHeader } from "../../primitives/SectionHeader";
import { PrGlyph, type PullRequestState } from "../PrGlyph";
import { type StatusCategory, StatusIcon } from "../StatusIcon";
import { TicketId } from "../TicketId";

// An anchor that the caller builds, such as a router Link. `ChainBlock`
// gives it the class names, the title and the children of a chain line.
type ChainLink = ReactElement<{ className?: string; title?: string; children?: ReactNode }>;

// The pull request that carries the work of a ticket in the chain.
export type ChainPr = {
	number: number;
	state: PullRequestState;
	isDraft: boolean;
};

export type ChainDependency = {
	identifier: string;
	title: string;
	status: StatusCategory;
	// True when only a person finishes the ticket, because the ticket asks a
	// question and holds the answer options. Such a line carries the yellow
	// dot and the words `your answer`.
	isQuestion: boolean;
	pr?: ChainPr;
	link: ChainLink;
};

export type ChainRelease = {
	identifier: string;
	title: string;
	link: ChainLink;
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
};

const stateWords: Record<PullRequestState, string> = { open: "open", closed: "closed", merged: "merged" };

const prWord = (pr: ChainPr) => (pr.state === "open" && pr.isDraft ? "draft" : stateWords[pr.state]);

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
// holds back, and the open question its answer depends on. Every sentence
// here reports a state. Nothing in this block starts a run or changes a
// ticket.
export function ChainBlock({ waitsOn, releases, ready }: ChainBlockProps) {
	// A question this ticket waits on decides how the ticket is built, so the
	// `Applies` line names it again with the word `open`. A ticket that waits
	// on no question has no `Applies` line.
	const question = waitsOn.find((dependency) => dependency.isQuestion);
	if (waitsOn.length === 0 && releases.length === 0) {
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
				<ChainRow label="Waits on">
					{waitsOn.length === 0 ? (
						<Nothing />
					) : (
						waitsOn.map((dependency) => <DependencyLine key={dependency.identifier} dependency={dependency} />)
					)}
				</ChainRow>
				<ChainRow label="Ready">
					<span className="text-sm text-fg">{ready}</span>
				</ChainRow>
				<ChainRow label="Releases">
					{releases.length === 0 ? (
						<Nothing />
					) : (
						releases.map((release) => <TicketLine key={release.identifier} {...release} />)
					)}
				</ChainRow>
				{question !== undefined && (
					<ChainRow label="Applies">
						<TicketLine identifier={question.identifier} title={question.title} link={question.link} note="open." />
					</ChainRow>
				)}
			</dl>
		</section>
	);
}

// The `dd` of `PropertyRow` lays its children in a row, and a chain clause
// holds a column of lines.
function ChainRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<PropertyRow label={label} align="start" labelWidth="wide">
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
		</PropertyRow>
	);
}

// A clause that holds no ticket prints one faint word, so the reader sees an
// empty clause and not a missing one.
function Nothing() {
	return <span className="text-sm text-fg-faint">nothing</span>;
}

const lineClass =
	"-mx-1 flex min-w-0 items-center gap-2 rounded-sm px-1 py-0.5 text-sm text-fg transition-colors duration-hover ease-out hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:py-2";

function DependencyLine({ dependency }: { dependency: ChainDependency }) {
	return cloneElement(dependency.link, {
		className: lineClass,
		title: dependency.title,
		children: (
			<>
				<StatusIcon category={dependency.status} label={statusWords[dependency.status]} />
				<TicketId id={dependency.identifier} size="sm" />
				<span className="min-w-0 flex-1 truncate">{dependency.title}</span>
				{dependency.isQuestion ? (
					<span className="flex shrink-0 items-center gap-1 text-fg-muted">
						<AttentionDot label={`${dependency.identifier} waits for your answer.`} />
						your answer
					</span>
				) : (
					dependency.pr !== undefined && (
						<span className="flex shrink-0 items-center gap-1 text-fg-muted">
							<PrGlyph state={dependency.pr.state} isDraft={dependency.pr.isDraft} size="sm" />
							<span className="tabular">{`#${dependency.pr.number}`}</span>
							{prWord(dependency.pr)}
						</span>
					)
				)}
			</>
		),
	});
}

// A release line and the `Applies` line hold the same three parts. `note` is
// the muted word between the identifier and the title, such as `open.` on the
// question that the ticket applies.
function TicketLine({
	identifier,
	title,
	link,
	note,
}: {
	identifier: string;
	title: string;
	link: ChainLink;
	note?: string;
}) {
	return cloneElement(link, {
		className: lineClass,
		title,
		children: (
			<>
				<TicketId id={identifier} size="sm" />
				{note !== undefined && <span className="shrink-0 text-fg-muted">{note}</span>}
				<span className="min-w-0 flex-1 truncate">{title}</span>
			</>
		),
	});
}
