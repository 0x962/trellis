import type { TerminalFrame, TerminalTransport } from "@trellis/ui/terminal";

export function localTransport(mode: "connected" | "connecting" | "error" | "unavailable" | "gap"): TerminalTransport {
	let output: (frame: TerminalFrame) => Promise<void>;
	let offset = mode === "gap" ? 256 : 0;
	let signal: AbortSignal;
	const write = async (text: string) => {
		const data = new TextEncoder().encode(text);
		const startOffset = offset;
		offset += data.byteLength;
		await output({ data, startOffset, nextOffset: offset, truncated: mode === "gap" });
	};
	return {
		follow: async (_offset, onOutput, onState, abortSignal) => {
			output = onOutput;
			signal = abortSignal;
			if (mode === "error") throw new Error("The terminal connection is closed.");
			onState({
				connection: mode === "connecting" ? "connecting" : "open",
				controllable: mode !== "connecting" && mode !== "unavailable",
				stopped: false,
				unavailableReason: mode === "unavailable" ? "The process does not accept input." : null,
			});
			if (mode !== "connecting") {
				await write("\u001b[32mAll checks pass.\u001b[0m\r\nLocal Storybook terminal\r\n$ ");
			}
			if (signal.aborted) return;
			await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
		},
		send: async (text) => {
			if (signal.aborted) return;
			await write(text === "\r" ? "\r\n$ " : text);
		},
		resize: async () => {},
	};
}
