import { expect, mock, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import { TerminalSurface, type TerminalSurfaceProps } from "./TerminalSurface";

const terminals: TestTerminal[] = [];
class TestTerminal {
	textarea = document.createElement("textarea");
	cols = 80;
	rows = 24;
	data = (_text: string) => {};
	disposed = false;
	constructor() {
		terminals.push(this);
	}
	loadAddon() {}
	open(host: HTMLElement) {
		Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 480 } });
		host.append(this.textarea);
	}
	attachCustomKeyEventHandler() {}
	onData(callback: (text: string) => void) {
		this.data = callback;
		return { dispose() {} };
	}
	write(_bytes: Uint8Array, done: () => void) {
		done();
	}
	reset() {}
	refresh() {}
	dispose() {
		this.disposed = true;
	}
}
mock.module("@xterm/xterm", () => ({ Terminal: TestTerminal }));
mock.module("@xterm/addon-fit", () => ({
	FitAddon: class {
		fit() {}
	},
}));

test("terminal input resumes after the session callback changes", async () => {
	const sent: string[] = [];
	let socketOpen = false;
	const signals: AbortSignal[] = [];
	const follow: TerminalSurfaceProps["follow"] = async (_offset, _output, signal) => {
		socketOpen = true;
		signals.push(signal);
		await new Promise<void>((resolve) =>
			signal.addEventListener(
				"abort",
				() => {
					socketOpen = false;
					resolve();
				},
				{ once: true },
			),
		);
	};
	const props: TerminalSurfaceProps = {
		label: "Terminal input",
		connected: false,
		follow,
		send: async (text) => {
			sent.push(text);
		},
		resize: async () => {
			if (!socketOpen) throw new Error("The terminal is not connected.");
		},
		onLeave: () => {},
	};
	const view = render(<TerminalSurface {...props} />);
	await waitFor(() => expect(signals).toHaveLength(1));
	view.rerender(<TerminalSurface {...props} connected />);
	await act(async () => {
		terminals.at(-1)!.data("a");
	});
	expect(sent).toEqual(["a"]);
	const nextFollow: TerminalSurfaceProps["follow"] = (...args) => follow(...args);
	view.rerender(<TerminalSurface {...props} connected follow={nextFollow} />);
	await waitFor(() => expect(signals).toHaveLength(2));
	await act(async () => {
		await Promise.resolve();
	});
	expect(screen.queryByRole("alert")?.textContent ?? null).toBeNull();
	expect(signals[1]!.aborted).toBe(false);
	view.rerender(<TerminalSurface {...props} connected={false} follow={nextFollow} />);
	view.rerender(<TerminalSurface {...props} connected follow={nextFollow} />);
	await act(async () => {
		terminals.at(-1)!.data("b");
	});
	expect(sent).toEqual(["a", "b"]);
});

test("a stopped agent has no terminal or subscription", async () => {
	const before = terminals.length;
	const follow = mock(async () => {});
	const view = render(
		<TerminalSurface
			stopped
			layout="fill"
			label="Terminal input"
			connected={false}
			follow={follow}
			send={async () => {}}
			resize={async () => {}}
			onLeave={() => {}}
		/>,
	);
	await act(async () => {
		await Promise.resolve();
	});
	expect(screen.getByRole("heading", { name: "Agent not running" }).textContent).toBe("Agent not running");
	expect(view.container.querySelector(".terminal-canvas")).toBeNull();
	expect(terminals.length).toBe(before);
	expect(follow).not.toHaveBeenCalled();
});

test("a stopped agent closes its terminal subscription and renderer", async () => {
	let signal: AbortSignal | undefined;
	const props: TerminalSurfaceProps = {
		label: "Terminal input",
		connected: false,
		follow: async (_offset, _output, next) => {
			signal = next;
			await new Promise<void>((resolve) => next.addEventListener("abort", () => resolve(), { once: true }));
		},
		send: async () => {},
		resize: async () => {},
		onLeave: () => {},
	};
	const view = render(<TerminalSurface {...props} />);
	await waitFor(() => expect(signal).toBeDefined());
	const terminal = terminals.at(-1)!;
	view.rerender(<TerminalSurface {...props} stopped />);
	expect(signal!.aborted).toBe(true);
	expect(terminal.disposed).toBe(true);
	expect(view.container.querySelector(".terminal-canvas")).toBeNull();
	expect(screen.getByRole("heading", { name: "Agent not running" }).textContent).toBe("Agent not running");
});
