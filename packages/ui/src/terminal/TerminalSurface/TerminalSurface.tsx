import { ArrowClockwise } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import "@xterm/xterm/css/xterm.css";
import "../terminal.css";
import { acquireTerminal, disposeTerminalIdentity } from "./terminalRegistry";
import {
	initialTerminalSnapshot,
	type TerminalConnectionState,
	type TerminalRuntime,
	type TerminalSnapshot,
	type TerminalTransport,
} from "./terminalRuntime";

export type TerminalSurfaceProps = {
	identity: string;
	createTransport: () => TerminalTransport;
	layout?: "panel" | "fill";
	label: string;
	stopped?: boolean;
	readOnly?: boolean;
	screenReaderMode?: boolean;
	autoFocus?: boolean;
	autoFocusDelay?: number;
	onConnectionChange?: (state: TerminalConnectionState) => void;
	onLeave: () => void;
};

export function TerminalSurface({
	identity,
	createTransport,
	layout = "panel",
	label,
	stopped = false,
	readOnly = false,
	screenReaderMode = true,
	autoFocus = false,
	autoFocusDelay = 0,
	onConnectionChange,
	onLeave,
}: TerminalSurfaceProps) {
	const container = useRef<HTMLDivElement>(null);
	const runtime = useRef<TerminalRuntime | null>(null);
	const view = useRef({ label, readOnly, screenReaderMode, onLeave });
	view.current = { label, readOnly, screenReaderMode, onLeave };
	const focusRequest = useRef({ autoFocus, autoFocusDelay });
	focusRequest.current = { autoFocus, autoFocusDelay };
	const [state, setState] = useState<{ identity: string; snapshot: TerminalSnapshot }>({
		identity,
		snapshot: initialTerminalSnapshot,
	});
	const snapshot = state.identity === identity ? state.snapshot : initialTerminalSnapshot;
	const ended = snapshot.stopped;
	useEffect(() => {
		onConnectionChange?.(snapshot);
	}, [onConnectionChange, snapshot]);
	useEffect(() => {
		runtime.current?.update({ label, readOnly, screenReaderMode, onLeave });
	}, [label, readOnly, screenReaderMode, onLeave]);
	useEffect(() => {
		if (stopped) {
			disposeTerminalIdentity(identity);
			return;
		}
		if (ended) return;
		const host = container.current!;
		const styles = getComputedStyle(host.parentElement!);
		const appearance = {
			fontFamily: styles.fontFamily,
			fontSize: Number.parseFloat(styles.fontSize),
			background: styles.backgroundColor,
			foreground: styles.color,
		};
		const lease = acquireTerminal(identity, appearance, createTransport);
		let active = true;
		let unsubscribe = () => {};
		let focusTimer: number | null = null;
		void lease.ready
			.then((current) => {
				if (!active) return;
				runtime.current = current;
				const update = () => setState({ identity, snapshot: current.getSnapshot() });
				unsubscribe = current.subscribe(update);
				current.attach(host, view.current, appearance);
				const request = focusRequest.current;
				if (request.autoFocus && !view.current.readOnly) {
					if (request.autoFocusDelay > 0) {
						focusTimer = window.setTimeout(() => {
							if (active) current.focus();
						}, request.autoFocusDelay);
					} else {
						current.focus();
					}
				}
				update();
			})
			.catch((failure: Error) => {
				if (active)
					setState({
						identity,
						snapshot: { ...initialTerminalSnapshot, connection: "closed", error: failure.message },
					});
			});
		return () => {
			active = false;
			if (focusTimer !== null) window.clearTimeout(focusTimer);
			unsubscribe();
			runtime.current = null;
			lease.release();
		};
	}, [identity, createTransport, stopped, ended]);
	// The buffer of a terminal ends with its process, so this block names
	// the state and leaves the control that starts a new process to the
	// screen around it.
	if (stopped || ended)
		return (
			<EmptyState
				image={null}
				title="The agent is not running"
				description="The output of the last run ended with its process."
				variant={layout === "fill" ? "page" : "section"}
			/>
		);
	return (
		<div className="terminal-surface" data-layout={layout}>
			{snapshot.error && (
				<div className="terminal-reconnect">
					<Tooltip content="Reconnect terminal">
						<IconButton
							label="Reconnect terminal"
							icon={<ArrowClockwise />}
							onClick={() => runtime.current?.reconnect()}
						/>
					</Tooltip>
				</div>
			)}
			{snapshot.gap && (
				<p role="status" className="terminal-notice">
					Earlier output is outside the retained buffer.
				</p>
			)}
			{snapshot.error && (
				<p role="alert" className="terminal-error">
					{snapshot.error}
				</p>
			)}
			{snapshot.unavailableReason && !snapshot.error && (
				<p role="alert" className="terminal-error">
					{snapshot.unavailableReason}
				</p>
			)}
			<div className="terminal-canvas">
				<div ref={container} className="terminal-host" />
			</div>
		</div>
	);
}
