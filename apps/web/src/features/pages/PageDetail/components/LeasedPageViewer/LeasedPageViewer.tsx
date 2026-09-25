import { ArrowClockwise } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { ConfirmDialog, FailureState, IconButton, PageViewer, Tooltip } from "@trellis/ui";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { openLink } from "../../../../../lib/openLink";
import { useTheme } from "../../../../../lib/theme";
import { failureKind } from "../../../../shell/RouteError";
import { readFrameMessage } from "../../frameMessage";
import { classifyPageLink } from "../../pageLink";
import { usePageLease } from "../../usePageLease";

export function LeasedPageViewer({ page, version, title }: { page: string; version: number; title: string }) {
	const { lease, error, refreshes, retry } = usePageLease(page, version);
	const frame = useRef<HTMLIFrameElement>(null);
	const position = useRef({ x: 0, y: 0 });
	const [readyLease, setReadyLease] = useState<string | null>(null);
	const [timedOut, setTimedOut] = useState(false);
	const [link, setLink] = useState<ReturnType<typeof classifyPageLink>>(null);
	const theme = useTheme();
	const leaseId = lease?.id;
	const nonce = lease?.nonce;
	const navigate = useNavigate();
	const sendState = useEffectEvent((resolved = theme.resolved) => {
		if (lease === null) return;
		const style = getComputedStyle(document.documentElement);
		const colors = Object.fromEntries(
			["--color-bg", "--color-fg", "--color-accent"].map((key) => [key, style.getPropertyValue(key)]),
		);
		frame.current?.contentWindow?.postMessage(
			{ type: "page-state", nonce: lease.nonce, ...position.current, theme: resolved, colors },
			"*",
		);
	});
	useEffect(() => {
		if (leaseId === undefined || nonce === undefined) return;
		setTimedOut(false);
		const timer = setTimeout(() => setTimedOut(true), 15_000);

		const receive = (event: MessageEvent) => {
			const message = readFrameMessage(event, frame.current?.contentWindow ?? null, nonce);
			if (message === null) return;
			if (message.type === "page-ready") {
				clearTimeout(timer);
				setTimedOut(false);
				setReadyLease(leaseId);
				sendState();
			}
			if (message.type === "page-scroll") position.current = { x: message.x, y: message.y };
			if (message.type === "page-link")
				setLink((current) => current ?? classifyPageLink(message.href, location.origin));
		};
		window.addEventListener("message", receive);
		sendState();
		return () => {
			clearTimeout(timer);
			window.removeEventListener("message", receive);
		};
	}, [leaseId, nonce]);
	useEffect(() => {
		sendState(theme.resolved);
	}, [theme.resolved]);
	const failed = error !== null || timedOut;
	return (
		<>
			<PageViewer
				title={title}
				version={version}
				frameRef={frame}
				frameUrl={lease?.frameUrl ?? null}
				pending={!failed && (lease === null || readyLease !== lease.id)}
				status={refreshes > 0 && readyLease === lease?.id ? "Page refreshed for security" : ""}
				error={
					failed ? (
						<FailureState
							title={
								error !== null && failureKind(error) === "offline"
									? "The server is offline"
									: "The Page content did not load"
							}
							description={
								timedOut
									? "The Page did not report that its content is ready."
									: "The viewer keeps its selected version."
							}
							detail={error instanceof Error ? error.message : undefined}
							action={
								<Tooltip content="Retry">
									<IconButton label="Retry" icon={<ArrowClockwise />} onClick={retry} />
								</Tooltip>
							}
						/>
					) : undefined
				}
			/>
			<ConfirmDialog
				open={link !== null}
				finalFocus={frame}
				title="Open this link?"
				description={link?.href ?? ""}
				confirmLabel="Open"
				onCancel={() => setLink(null)}
				onConfirm={() => {
					if (link === null) return;
					if (link.internal) void navigate({ href: link.href });
					else openLink(link.href);
					setLink(null);
				}}
			/>
		</>
	);
}
