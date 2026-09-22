// The document text that a thread is about, as a quote over its comments. A
// quote whose text an edit deleted keeps the words it held, struck through,
// under the note "Text removed".
export function QuotedText({ quote, textRemoved }: { quote: string; textRemoved: boolean }) {
	return (
		<div className="mb-2 flex flex-col gap-0.5 border-l-2 border-warning pl-2 text-sm text-fg-muted">
			{textRemoved && <span className="text-xs font-medium text-fg-faint">Text removed</span>}
			<span className={textRemoved ? "line-clamp-3 line-through" : "line-clamp-3"}>{quote}</span>
		</div>
	);
}
