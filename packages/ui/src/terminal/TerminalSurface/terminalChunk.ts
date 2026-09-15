export type TerminalFrame = { data: string | Uint8Array; startOffset: number; nextOffset: number; truncated: boolean };

export const terminalChunk = (frame: TerminalFrame, offset: number) => {
	if (frame.nextOffset <= offset) return { bytes: new Uint8Array(), reset: false, nextOffset: offset };
	const bytes =
		typeof frame.data === "string"
			? Uint8Array.from(atob(frame.data), (character) => character.charCodeAt(0))
			: frame.data;
	return {
		bytes: bytes.subarray(Math.max(0, offset - frame.startOffset)),
		reset: frame.startOffset > offset,
		nextOffset: frame.nextOffset,
	};
};
