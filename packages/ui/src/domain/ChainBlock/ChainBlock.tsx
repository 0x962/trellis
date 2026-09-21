import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";
import { BlockRow, NothingWord } from "../../review/BlockRow";
import { type StatusCategory, StatusIcon } from "../StatusIcon";
import { type TicketAnchor, TicketLine, type TicketRef } from "../TicketLine";

export type ChainDependency = {
	identifier: string;
	title: string;
	status: StatusCategory;
	link: TicketAnchor;
};

export type ChainRelease = TicketRef;

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

// The chain of one ticket: what holds it back, whether it can start, and what
// it holds back. Every sentence here reports a state. Nothing in this block starts a run or
// changes a ticket.
export function ChainBlock({ waitsOn, releases, ready }: ChainBlockProps) {
	if (waitsOn.length === 0 && releases.length === 0) {
		return (
			<section aria-label="The chain" className="flex min-w-0 flex-col">
				<SectionHeader title="The chain" textCase="caps" />
				<EmptyState description="The ticket waits for nothing, and no ticket waits for it." />
			</section>
		);
	}
	return (
		<section aria-label="The chain" className="flex min-w-0 flex-col">
			<SectionHeader title="The chain" textCase="caps" />
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
			</dl>
		</section>
	);
}
