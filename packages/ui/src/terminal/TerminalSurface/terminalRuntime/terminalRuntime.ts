import { terminalInputSource } from "../terminalInputSource";
import { terminalOutput } from "../terminalOutput";
import { terminalResize } from "../terminalResize";
import { terminalWebgl } from "../terminalWebgl";
import { terminalWheel } from "../terminalWheel";
import {
	initialTerminalSnapshot,
	type TerminalAppearance,
	type TerminalSnapshot,
	type TerminalTransport,
	type TerminalView,
} from "./types";

export async function createTerminalRuntime(
	appearance: TerminalAppearance,
	createTransport: () => TerminalTransport,
	parking: HTMLElement,
	onDispose: () => void,
) {
	const [{ Terminal }, { FitAddon }, { WebglAddon }] = await Promise.all([
		import("@xterm/xterm"),
		import("@xterm/addon-fit"),
		import("@xterm/addon-webgl"),
	]);
	const wrapper = document.createElement("div");
	wrapper.className = "terminal-host";
	parking.append(wrapper);
	const terminal = new Terminal({
		fontFamily: appearance.fontFamily,
		fontSize: appearance.fontSize,
		convertEol: false,
		scrollback: 5000,
		screenReaderMode: true,
		theme: { background: appearance.background, foreground: appearance.foreground, cursor: appearance.foreground },
	});
	const fit = new FitAddon();
	terminal.loadAddon(fit);
	terminal.open(wrapper);
	const transport = createTransport();
	const wheel = terminalWheel(terminal);
	const source = terminalInputSource(wrapper);
	const listeners = new Set<() => void>();
	let snapshot = initialTerminalSnapshot;
	let view: TerminalView | null = null;
	let disposeWebgl: (() => void) | null = null;
	let connection: AbortController;
	let disposed = false;
	const publish = (next: Partial<TerminalSnapshot>) => {
		snapshot = { ...snapshot, ...next };
		for (const listener of listeners) listener();
	};
	const fail = (failure: unknown) => {
		if (disposed) return;
		connection?.abort();
		publish({ connection: "closed", controllable: false, error: (failure as Error).message });
		if (!view) dispose();
	};
	const resize = terminalResize(terminal, fit, (cols, rows) => {
		if (view && !view.readOnly && snapshot.connection === "open" && snapshot.controllable && !snapshot.error)
			void transport.resize(cols, rows).catch(fail);
	});
	const focus = () => resize.request(true);
	wrapper.addEventListener("focusin", focus);
	const output = terminalOutput({
		write: resize.write,
		reset: () => {
			wheel.reset();
			terminal.reset();
			publish({ gap: true });
		},
	});
	terminal.attachCustomKeyEventHandler((event) => {
		event.stopPropagation();
		if (event.ctrlKey && event.key === "]") {
			view?.onLeave();
			return false;
		}
		return true;
	});
	const data = terminal.onData((text) => {
		const userInput = source.isUserInput(text);
		if (snapshot.connection !== "open" || !snapshot.controllable || snapshot.error || view?.readOnly) return;
		if (userInput && !view) return;
		void transport.send(text, userInput).catch(fail);
	});
	const connect = () => {
		connection?.abort();
		const current = new AbortController();
		connection = current;
		publish({ connection: "connecting", controllable: false, error: null });
		void transport
			.follow(
				output.offset(),
				output.push,
				(state) => {
					if (current.signal.aborted || disposed) return;
					const becameWritable =
						state.connection === "open" &&
						state.controllable &&
						(snapshot.connection !== "open" || !snapshot.controllable);
					publish(state);
					if (!state.stopped && becameWritable) resize.request(true);
				},
				current.signal,
			)
			.then(() => {
				if (!current.signal.aborted && snapshot.stopped) dispose();
			})
			.catch((failure) => {
				if (!current.signal.aborted) fail(failure);
			});
	};
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		publish({ connection: "closed", stopped: true, controllable: false });
		connection?.abort();
		view = null;
		wrapper.removeEventListener("focusin", focus);
		resize.dispose();
		data.dispose();
		source.dispose();
		output.dispose();
		wheel.dispose();
		disposeWebgl?.();
		disposeWebgl = null;
		terminal.dispose();
		wrapper.remove();
		listeners.clear();
		onDispose();
	};
	connect();
	return {
		getSnapshot: () => snapshot,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		attach(host: HTMLElement, next: TerminalView, nextAppearance: TerminalAppearance) {
			if (disposed) return;
			view = next;
			host.append(wrapper);
			terminal.options.fontFamily = nextAppearance.fontFamily;
			terminal.options.fontSize = nextAppearance.fontSize;
			terminal.options.theme = {
				background: nextAppearance.background,
				foreground: nextAppearance.foreground,
				cursor: nextAppearance.foreground,
			};
			terminal.options.screenReaderMode = next.screenReaderMode;
			terminal.textarea?.setAttribute("aria-label", next.label);
			disposeWebgl = terminalWebgl(terminal, () => new WebglAddon());
			resize.attach(host);
		},
		update(next: TerminalView) {
			if (disposed) return;
			const becameWritable = view?.readOnly === true && !next.readOnly;
			view = next;
			terminal.options.screenReaderMode = next.screenReaderMode;
			terminal.textarea?.setAttribute("aria-label", next.label);
			if (becameWritable) resize.request(true);
		},
		detach() {
			if (disposed) return;
			view = null;
			terminal.blur();
			resize.detach();
			disposeWebgl?.();
			disposeWebgl = null;
			parking.append(wrapper);
			if (snapshot.connection === "closed") dispose();
		},
		// Sends the current size of this view to the process again. Two views
		// of one process, such as the terminal on a session page and the same
		// terminal in a sheet over it, share one process size. The last view to
		// send wins, so a view that stays calls this when the other one leaves.
		resendSize: () => resize.request(true),
		reconnect: connect,
		dispose,
	};
}

export type TerminalRuntime = Awaited<ReturnType<typeof createTerminalRuntime>>;
