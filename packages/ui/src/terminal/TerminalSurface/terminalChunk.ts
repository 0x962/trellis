export type TerminalFrame = { data: string; startOffset: number; nextOffset: number; truncated: boolean };

export const terminalChunk = (frame: TerminalFrame, offset: number) => ({
	bytes: Uint8Array.from(atob(frame.data), (character) => character.charCodeAt(0)),
	reset: frame.truncated || frame.startOffset !== offset,
	nextOffset: frame.nextOffset,
});
