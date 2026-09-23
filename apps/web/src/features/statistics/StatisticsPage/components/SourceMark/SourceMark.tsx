import { Badge } from "@trellis/ui";

// Where one figure of the statistics page comes from. Every figure carries
// one of these three words, so a reader never has to guess whether a number
// is measured or estimated. The page prints the three sentences once, under
// the last block.
export type FigureSource = "today" | "query" | "record";

export const sourceWords: Record<FigureSource, string> = {
	today: "The product computes this value now, through a call that exists.",
	query: "The rows are in the database. A statement of this page reads them. Nothing new is recorded.",
	record: "Nothing records this value. The page prints no number until a column holds it.",
};

export function SourceMark({ source }: { source: FigureSource }) {
	return (
		<span title={sourceWords[source]} className="inline-flex shrink-0">
			<Badge>{source}</Badge>
		</span>
	);
}
