import { useEffect, useRef, useState } from "react";
import { FailureState } from "../../domain/FailureState";
import { useTheme } from "../../hooks/useTheme";
import { Button } from "../../primitives/Button";
import { EmptyState } from "../../primitives/EmptyState";
import type { LinkPress } from "../../utils/linkPress";
import "@xterm/xterm/css/xterm.css";
import "../terminal.css";
import { terminalAppearance } from "./terminalAppearance";
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
	getPathForFile?: (file: File) => string;
	screenReaderMode?: boolean;
	autoFocus?: boolean;
	autoFocusDelay?: number;
	onConnectionChange?: (state: TerminalConnectionState) => void;
	onLeave: () => void;
	onOpenLink: (url: string, press: LinkPress) => void;
};

export function TerminalSurface({
	identity,
	createTransport,
	layout = "panel",
	label,
	stopped = false,
	readOnly = false,
	getPathForFile,
	screenReaderMode = true,
	autoFocus = false,
	autoFocusDelay = 0,
	onConnectionChange,
	onLeave,
	onOpenLink,
}: TerminalSurfaceProps) {
	const container = useRef<HTMLDivElement>(null);
	const { resolved: theme } = useTheme();
	const runtime = useRef<TerminalRuntime | null>(null);
	const [loadAttempt, setLoadAttempt] = useState(0);
	const view = useRef({ label, readOnly, getPathForFile, screenReaderMode, onLeave, onOpenLink });
	view.current = { label, readOnly, getPathForFile, screenReaderMode, onLeave, onOpenLink };
	const focusRequest = useRef({ autoFocus, autoFocusDelay });
	focusRequest.current = { autoFocus, autoFocusDelay };
	const [state, setState] = useState<{ identity: string; loadAttempt: number; snapshot: TerminalSnapshot }>({
		identity,
		loadAttempt,
		snapshot: initialTerminalSnapshot,
	});
	const snapshot =
		state.identity === identity && state.loadAttempt === loadAttempt ? state.snapshot : initialTerminalSnapshot;
	const reconnect = () => {
		if (runtime.current) runtime.current.reconnect();
		else setLoadAttempt((attempt) => attempt + 1);
	};
	const ended = snapshot.stopped;
	useEffect(() => {
		onConnectionChange?.(snapshot);
	}, [onConnectionChange, snapshot]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: The theme changes the CSS values read by terminalAppearance.
	useEffect(() => {
		runtime.current?.update(
			{ label, readOnly, getPathForFile, screenReaderMode, onLeave, onOpenLink },
			terminalAppearance(container.current!),
		);
	}, [label, readOnly, getPathForFile, screenReaderMode, onLeave, onOpenLink, theme]);
	useEffect(() => {
		if (stopped) {
			disposeTerminalIdentity(identity);
			return;
		}
		if (ended) return;
		const host = container.current!;
		const appearance = terminalAppearance(host);
		const lease = acquireTerminal(identity, appearance, createTransport);
		let active = true;
		let unsubscribe = () => {};
		let focusTimer: number | null = null;
		void lease.ready
			.then((current) => {
				if (!active) return;
				runtime.current = current;
				const update = () => setState({ identity, loadAttempt, snapshot: current.getSnapshot() });
				unsubscribe = current.subscribe(update);
				current.attach(host, view.current, terminalAppearance(host));
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
						loadAttempt,
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
	}, [identity, createTransport, stopped, ended, loadAttempt]);
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
			<div className="terminal-canvas">
				<div ref={container} className="terminal-host" />
			</div>
			{snapshot.error && (
				<FailureState
					title={runtime.current ? "The terminal disconnected" : "The terminal did not load"}
					description="Reconnect to continue in this session."
					detail={snapshot.error}
					className="terminal-feedback"
					action={
						<Button size="md" onClick={reconnect}>
							Reconnect terminal
						</Button>
					}
				/>
			)}
			{snapshot.gap && (
				<p role="status" className="terminal-notice">
					Earlier output is outside the retained buffer.
				</p>
			)}
			{snapshot.unavailableReason && !snapshot.error && (
				<FailureState
					title="Terminal input is unavailable"
					description="The process cannot accept input."
					detail={snapshot.unavailableReason}
					className="terminal-feedback"
				/>
			)}
			{snapshot.connection === "connecting" && !snapshot.error && (
				<p role="status" className="terminal-notice">
					Connect terminal…
				</p>
			)}
		</div>
	);
}
