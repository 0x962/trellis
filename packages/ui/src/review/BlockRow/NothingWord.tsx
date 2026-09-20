// An empty row of a ticket block shows this word, so the reader sees an empty
// row and not missing data.
export function NothingWord() {
	return <span className="text-sm text-fg-faint">nothing</span>;
}
