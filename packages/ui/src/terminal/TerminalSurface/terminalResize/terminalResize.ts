import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";

export function terminalResize(terminal: Terminal, fit: FitAddon, send: (cols: number, rows: number) => void) {
	let host: HTMLElement | null = null;
	let observer: ResizeObserver | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let parsing = 0;
	let pending = false;
	let force = false;
	let disposed = false;
	let attachFrame: number | undefined;
	// True from the moment a view attaches until the first fit that follows it.
	// That fit puts the viewport on the newest line, so a terminal that a person
	// left scrolled up opens on the newest output. Every later fit keeps the
	// line the person reads.
	let showNewest = false;
	const measure = () => {
		if (disposed || attachFrame !== undefined || parsing || !pending || !host?.clientWidth || !host.clientHeight)
			return;
		pending = false;
		const buffer = terminal.buffer.active;
		const pinned = showNewest || buffer.viewportY >= buffer.baseY;
		const viewport = buffer.viewportY;
		const cols = terminal.cols;
		const rows = terminal.rows;
		fit.fit();
		// scrollToBottom also clears the scroll position that the person set, so
		// output that arrives after it moves the viewport with it again.
		if (pinned) terminal.scrollToBottom();
		else terminal.scrollToLine(Math.min(viewport, terminal.buffer.active.baseY));
		showNewest = false;
		terminal.refresh(0, terminal.rows - 1);
		if (force || cols !== terminal.cols || rows !== terminal.rows) send(terminal.cols, terminal.rows);
		force = false;
	};
	const request = (forceNotify = false) => {
		pending = true;
		force ||= forceNotify;
		measure();
	};
	const detach = () => {
		clearTimeout(timer);
		if (attachFrame !== undefined) cancelAnimationFrame(attachFrame);
		attachFrame = undefined;
		observer?.disconnect();
		observer = null;
		host = null;
		pending = false;
		force = false;
		showNewest = false;
	};
	return {
		request,
		attach(next: HTMLElement) {
			detach();
			host = next;
			showNewest = true;
			// WebGL attaches on the next frame. Fit after it replaces the renderer and updates terminal geometry.
			attachFrame = requestAnimationFrame(() => {
				attachFrame = undefined;
				request(true);
			});
			let reveal = false;
			observer = new ResizeObserver((entries) => {
				clearTimeout(timer);
				if (entries.some((entry) => entry.contentRect.width <= 0 || entry.contentRect.height <= 0)) {
					reveal = true;
					return;
				}
				timer = setTimeout(() => {
					request(reveal);
					reveal = false;
				}, 75);
			});
			observer.observe(next);
		},
		detach,
		write(bytes: Uint8Array, complete: () => void) {
			parsing++;
			terminal.write(bytes, () => {
				complete();
				// xterm removes the parsed write after this callback. Resize only after that removal completes.
				queueMicrotask(() => {
					parsing--;
					measure();
				});
			});
		},
		dispose() {
			disposed = true;
			detach();
		},
	};
}
