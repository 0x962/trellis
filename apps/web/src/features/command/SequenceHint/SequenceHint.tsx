export type SequenceHintProps = {
	// The first key of the pending sequence, or null.
	pending: string | null;
};

// The "g…" hint in the bottom left corner while a sequence waits for its
// second key. The hint slides up as it appears; under reduced motion it
// only fades.
export function SequenceHint({ pending }: SequenceHintProps) {
	if (pending === null) return null;
	return (
		<output
			className="fixed bottom-4 left-4 z-50 inline-flex h-7 items-center rounded-md border border-border bg-elevated px-2 font-mono text-sm text-fg-muted shadow-md transition-[opacity,translate] duration-hover ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:translate-y-0 motion-reduce:transition-opacity motion-reduce:starting:translate-y-0"
			data-sequence-hint=""
		>
			{pending}…
		</output>
	);
}
