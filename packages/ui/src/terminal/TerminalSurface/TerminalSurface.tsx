import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import "../terminal.css";
import { type TerminalFrame, terminalChunk } from "./terminalChunk.ts";

export type TerminalSurfaceProps = {
	label: string;
	connected: boolean;
	load: (offset: number) => Promise<TerminalFrame>;
	send: (text: string) => Promise<unknown>;
	resize: (cols: number, rows: number) => Promise<unknown>;
	onLeave: () => void;
};

export function TerminalSurface({ label, connected, load, send, resize, onLeave }: TerminalSurfaceProps) {
	const container = useRef<HTMLDivElement>(null);
	const enabled = useRef(connected);
	const failed = useRef(false);
	enabled.current = connected;
	const [error, setError] = useState<string | null>(null);
	const [gap, setGap] = useState(false);
	useEffect(() => {
		let disposed = false;
		let dispose = () => {};
		let timer: ReturnType<typeof setTimeout>;
		const start = async () => {
			const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
			if (disposed) return;
			const styles = getComputedStyle(container.current!);
			const terminal = new Terminal({
				fontFamily: styles.fontFamily,
				fontSize: Number.parseFloat(styles.fontSize),
				convertEol: false,
				scrollback: 5000,
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
				enabled.current = false;
				failed.current = true;
				setError((failure as Error).message);
				clearTimeout(timer);
			};
			let input = Promise.resolve<unknown>(undefined);
			const data = terminal.onData((text) => {
				if (enabled.current && !failed.current)
					input = input.then(() => (enabled.current && !failed.current ? send(text) : undefined)).catch(fail);
			});
			const observer = new ResizeObserver(() => {
				if (!container.current?.clientWidth || !container.current.clientHeight) return;
				fit.fit();
				if (enabled.current && !failed.current) void resize(terminal.cols, terminal.rows).catch(fail);
			});
			observer.observe(container.current!);
			let offset = 0;
			const follow = async () => {
				const frame = await load(offset);
				if (disposed) return;
				const chunk = terminalChunk(frame, offset);
				if (chunk.reset) {
					terminal.reset();
					setGap(true);
				}
				if (chunk.bytes.length) await new Promise<void>((resolve) => terminal.write(chunk.bytes, resolve));
				offset = chunk.nextOffset;
				if (!disposed) timer = setTimeout(() => void follow().catch(fail), 500);
			};
			dispose = () => {
				observer.disconnect();
				data.dispose();
				terminal.dispose();
			};
			await follow();
		};
		void start().catch((failure: Error) => {
			if (!disposed) {
				failed.current = true;
				setError(failure.message);
			}
		});
		return () => {
			disposed = true;
			clearTimeout(timer);
			dispose();
		};
	}, [label, load, send, resize, onLeave]);
	return (
		<div className="terminal-surface">
			<p className="terminal-hint">Press Control+] to leave the terminal.</p>
			{gap && (
				<p role="status" className="terminal-notice">
					Earlier output is outside the retained buffer.
				</p>
			)}
			{error && (
				<p role="alert" className="terminal-error">
					Terminal connection failed. {error} Close and reopen the terminal to reconnect.
				</p>
			)}
			<div ref={container} className="terminal-canvas" />
		</div>
	);
}
