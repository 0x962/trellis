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
	onConnectionChange,
	onLeave,
}: TerminalSurfaceProps) {
	const container = useRef<HTMLDivElement>(null);
	const runtime = useRef<TerminalRuntime | null>(null);
	const view = useRef({ label, readOnly, screenReaderMode, onLeave });
	view.current = { label, readOnly, screenReaderMode, onLeave };
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
		void lease.ready
			.then((current) => {
				if (!active) return;
				runtime.current = current;
				const update = () => setState({ identity, snapshot: current.getSnapshot() });
				unsubscribe = current.subscribe(update);
				current.attach(host, view.current, appearance);
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
			unsubscribe();
			runtime.current = null;
			lease.release();
		};
	}, [identity, createTransport, stopped, ended]);
	if (stopped || ended)
		return <EmptyState title="Agent not running" variant={layout === "fill" ? "page" : "section"} />;
	return (
		<div className="terminal-surface" data-layout={layout}>
			<div className="terminal-toolbar">
				<p className="terminal-hint">Press Control+] to leave the terminal.</p>
				{snapshot.error && (
					<Tooltip content="Reconnect terminal">
						<IconButton
							label="Reconnect terminal"
							icon={<ArrowClockwise />}
							onClick={() => runtime.current?.reconnect()}
						/>
					</Tooltip>
				)}
			</div>
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
