import type { Terminal } from "@xterm/xterm";

export function terminalWheel(terminal: Terminal) {
	let encoding: "default" | "sgr" | "pixel" = "default";
	let partialLines = 0;
	let context = "";
	const reset = () => {
		encoding = "default";
		partialLines = 0;
		context = "";
	};
	const trackEncoding = (params: (number | number[])[], enabled: boolean) => {
		for (const mode of params) {
			if (mode === 1006) encoding = enabled ? "sgr" : "default";
			if (mode === 1016) encoding = enabled ? "pixel" : "default";
		}
		return false;
	};
	const handlers = [
		terminal.parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => trackEncoding(params, true)),
		terminal.parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) => trackEncoding(params, false)),
		terminal.parser.registerEscHandler({ final: "c" }, () => {
			reset();
			return false;
		}),
	];
	terminal.attachCustomWheelEventHandler((event) => {
		const tracking = terminal.modes.mouseTrackingMode;
		const reportsMouse = tracking === "vt200" || tracking === "drag" || tracking === "any";
		const applicationCursor = terminal.modes.applicationCursorKeysMode;
		const buffer = terminal.buffer.active.type;
		const nextContext = `${buffer}:${tracking}:${encoding}:${applicationCursor}`;
		if (context !== nextContext) {
			context = nextContext;
			partialLines = 0;
		}
		if (event.deltaY === 0 || event.shiftKey) return true;
		if (reportsMouse ? encoding !== "sgr" : buffer !== "alternate") return true;
		const screen = terminal.element!.querySelector(".xterm-screen")!;
		const rect = screen.getBoundingClientRect();
		const cellHeight = rect.height / terminal.rows;
		const cellWidth = rect.width / terminal.cols;
		const sensitivity =
			(terminal.options.scrollSensitivity ?? 1) *
			(event.altKey || event.ctrlKey ? (terminal.options.fastScrollSensitivity ?? 5) : 1);
		const delta = event.deltaY * sensitivity;
		const lines = event.deltaMode === 1 ? delta : event.deltaMode === 2 ? delta * terminal.rows : delta / cellHeight;
		partialLines += lines;
		const wholeLines = Math.trunc(partialLines);
		partialLines -= wholeLines;
		const count = Math.min(Math.abs(wholeLines), terminal.rows);
		if (Math.abs(wholeLines) > terminal.rows) partialLines = 0;
		if (count) {
			let sequence: string;
			if (reportsMouse) {
				const col = Math.max(1, Math.min(terminal.cols, Math.floor((event.clientX - rect.left) / cellWidth) + 1));
				const row = Math.max(1, Math.min(terminal.rows, Math.floor((event.clientY - rect.top) / cellHeight) + 1));
				const button = (wholeLines < 0 ? 64 : 65) + (event.altKey ? 8 : 0) + (event.ctrlKey ? 16 : 0);
				sequence = `\x1b[<${button};${col};${row}M`;
			} else sequence = `\x1b${applicationCursor ? "O" : "["}${wholeLines < 0 ? "A" : "B"}`;
			terminal.input(sequence.repeat(count), true);
		}
		event.preventDefault();
		event.stopPropagation();
		return false;
	});
	return {
		reset,
		dispose: () => {
			for (const handler of handlers) handler.dispose();
			terminal.attachCustomWheelEventHandler(() => true);
		},
	};
}
