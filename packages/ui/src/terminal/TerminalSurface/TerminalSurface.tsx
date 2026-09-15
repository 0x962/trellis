import { ArrowClockwise } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import "@xterm/xterm/css/xterm.css";
import "../terminal.css";
import { type TerminalFrame, terminalChunk } from "./terminalChunk.ts";
import { terminalInputSource } from "./terminalInputSource.ts";

export type TerminalSurfaceProps = {
	layout?: "panel" | "fill";
	label: string;
	connected: boolean;
	unavailableReason?: string | null;
	follow: (offset: number, onOutput: (frame: TerminalFrame) => Promise<void>, signal: AbortSignal) => Promise<void>;
	send: (text: string, userInput: boolean) => Promise<unknown>;
	resize: (cols: number, rows: number) => Promise<unknown>;
	onLeave: () => void;
};

export function TerminalSurface({
	layout = "panel",
	label,
	connected,
	unavailableReason,
	follow,
	send,
	resize,
	onLeave,
}: TerminalSurfaceProps) {
	const container = useRef<HTMLDivElement>(null);
	const enabled = useRef(connected);
	const failed = useRef(false);
	const reconnect = useRef(() => {});
	const fitCurrent = useRef(() => {});
	enabled.current = connected;
	const [error, setError] = useState<string | null>(null);
	const [gap, setGap] = useState(false);
	useEffect(() => {
		if (connected) fitCurrent.current();
	}, [connected]);
	useEffect(() => {
		let disposed = false;
		let dispose = () => {};
		let connection: AbortController;
		const start = async () => {
			const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
			if (disposed) return;
			const styles = getComputedStyle(container.current!);
			const terminal = new Terminal({
				fontFamily: styles.fontFamily,
				fontSize: Number.parseFloat(styles.fontSize),
				convertEol: false,
				scrollback: 5000,
				screenReaderMode: true,
				theme: { background: styles.backgroundColor, foreground: styles.color, cursor: styles.color },
			});
			const fit = new FitAddon();
			terminal.loadAddon(fit);
			terminal.open(container.current!);
			terminal.textarea?.setAttribute("aria-label", label);
			terminal.attachCustomKeyEventHandler((event) => {
				event.stopPropagation();
				if (event.ctrlKey && event.key === "]") {
					onLeave();
					return false;
				}
				return true;
			});
			const fail = (failure: unknown) => {
				if (disposed) return;
				failed.current = true;
				connection?.abort();
				setError((failure as Error).message);
			};
			let input = Promise.resolve<unknown>(undefined);
			const source = terminalInputSource(container.current!);
			const data = terminal.onData((text) => {
				const userInput = source.isUserInput(text);
				if (enabled.current && !failed.current)
					input = input
						.then(() => (enabled.current && !failed.current ? send(text, userInput) : undefined))
						.catch(fail);
			});
			const fitTerminal = () => {
				if (!container.current?.clientWidth || !container.current.clientHeight) return;
				fit.fit();
				if (enabled.current && !failed.current) void resize(terminal.cols, terminal.rows).catch(fail);
			};
			fitCurrent.current = fitTerminal;
			const observer = new ResizeObserver(fitTerminal);
			observer.observe(container.current!);
			fitTerminal();
			let offset = 0;
			const pendingWrites = new Set<() => void>();
			const write = async (frame: TerminalFrame) => {
				if (disposed) return;
				const chunk = terminalChunk(frame, offset);
				if (chunk.reset) {
					terminal.reset();
					setGap(true);
				}
				if (chunk.bytes.length)
					await new Promise<void>((resolve) => {
						pendingWrites.add(resolve);
						terminal.write(chunk.bytes, () => {
							pendingWrites.delete(resolve);
							resolve();
						});
					});
				offset = chunk.nextOffset;
			};
			const connect = () => {
				connection?.abort();
				enabled.current = false;
				const current = new AbortController();
				connection = current;
				failed.current = false;
				setError(null);
				void follow(offset, write, current.signal).catch((failure) => {
					if (!current.signal.aborted) fail(failure);
				});
			};
			reconnect.current = connect;
			dispose = () => {
				connection?.abort();
				observer.disconnect();
				data.dispose();
				source.dispose();
				for (const resolve of pendingWrites) resolve();
				pendingWrites.clear();
				terminal.dispose();
			};
			connect();
		};
		void start().catch((failure: Error) => {
			if (!disposed) {
				failed.current = true;
				setError(failure.message);
			}
		});
		return () => {
			disposed = true;
			dispose();
		};
	}, [label, follow, send, resize, onLeave]);
	return (
		<div className="terminal-surface" data-layout={layout}>
			<div className="terminal-toolbar">
				<p className="terminal-hint">Press Control+] to leave the terminal.</p>
				{error && (
					<Tooltip content="Reconnect terminal">
						<IconButton label="Reconnect terminal" icon={<ArrowClockwise />} onClick={() => reconnect.current()} />
					</Tooltip>
				)}
			</div>
			{gap && (
				<p role="status" className="terminal-notice">
					Earlier output is outside the retained buffer.
				</p>
			)}
			{error && (
				<p role="alert" className="terminal-error">
					{error}
				</p>
			)}
			{unavailableReason && !error && (
				<p role="alert" className="terminal-error">
					{unavailableReason}
				</p>
			)}
			<div ref={container} className="terminal-canvas" />
		</div>
	);
}
