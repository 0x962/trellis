export type SequenceHintProps = {
	// The first key of the pending sequence, or null.
	pending: string | null;
};

// The "g…" hint in the bottom left corner while a sequence waits for its
// second key.
export function SequenceHint(_props: SequenceHintProps) {
	return null;
}
