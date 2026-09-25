import type { TerminalFrame } from "../terminalChunk";

export type TerminalConnectionState = {
	connection: "connecting" | "open" | "closed";
	controllable: boolean;
	stopped: boolean;
	unavailableReason: string | null;
};

export type TerminalTransport = {
	follow: (
		offset: number,
		onOutput: (frame: TerminalFrame) => Promise<void>,
		onState: (state: TerminalConnectionState) => void,
		signal: AbortSignal,
	) => Promise<void>;
	send: (text: string, userInput: boolean) => Promise<unknown>;
	resize: (cols: number, rows: number) => Promise<unknown>;
};

export type TerminalSnapshot = TerminalConnectionState & { error: string | null; gap: boolean };

export const initialTerminalSnapshot: TerminalSnapshot = {
	connection: "connecting",
	controllable: false,
	stopped: false,
	unavailableReason: null,
	error: null,
	gap: false,
};

export type TerminalAppearance = {
	fontFamily: string;
	fontSize: number;
	background: string;
	foreground: string;
};

export type TerminalView = {
	label: string;
	readOnly: boolean;
	getPathForFile?: (file: File) => string;
	screenReaderMode: boolean;
	onLeave: () => void;
};
