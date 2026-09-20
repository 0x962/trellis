import { ChainBlock, type ChainDependency, type ChainRelease } from "../../../../domain/ChainBlock";
import { Section } from "../../Section";

// The gallery has no router, so a chain line is a plain anchor here. A page
// passes a router Link. `ChainBlock` replaces the children of the anchor with
// the content of the line, so the identifier below never reaches the screen.
const link = (identifier: string) => <a href={`/t/${identifier}`}>{identifier}</a>;

// Screens 5 and 6 of section 2 in
// docs/research/trellis-for-one-human-and-many-agents.md hold these words.
// OP-33 and OP-34 of the Routines E2E epic both wait on OP-32.
const op32: ChainDependency = {
	identifier: "OP-32",
	title: "Service: A routine run opens a chat and queues the turn",
	status: "review",
	isQuestion: false,
	link: link("OP-32"),
};

// OP-33 also waits on a question, so its chain carries the `Applies` line.
const op52: ChainDependency = {
	identifier: "OP-52",
	title: "Decision: a missed window, run it late or leave it missed",
	status: "review",
	isQuestion: true,
	link: link("OP-52"),
};

const op34Releases: ChainRelease[] = [
	{ identifier: "OP-35", title: "Service: A run whose webhook never came is closed", link: link("OP-35") },
	{
		identifier: "OP-42",
		title: "Service: A routine run's token lives six hours, and settling revokes it",
		link: link("OP-42"),
	},
];

export function ChainBlockSection() {
	return (
		<Section name="ChainBlock" note="OP-33, OP-34, and a ticket with no chain" className="items-start">
			<div className="min-w-96 flex-1">
				<ChainBlock waitsOn={[op32, op52]} releases={[]} ready="no. OP-32 is not merged, and OP-52 is open." />
			</div>
			<div className="min-w-96 flex-1">
				<ChainBlock waitsOn={[op32]} releases={op34Releases} ready="no. OP-32 is not merged." />
			</div>
			<div className="min-w-96 flex-1">
				<ChainBlock waitsOn={[]} releases={[]} ready="yes. No ticket holds this one back." />
			</div>
		</Section>
	);
}
