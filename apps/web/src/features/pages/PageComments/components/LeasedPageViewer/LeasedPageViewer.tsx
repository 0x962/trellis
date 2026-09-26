import { ArrowClockwise } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import type { PageCommentThread } from "@trellis/api";
import { ConfirmDialog, FailureState, IconButton, PageCommentPin, PageViewer, Tooltip } from "@trellis/ui";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { openLink } from "../../../../../lib/openLink";
import { useTheme } from "../../../../../lib/theme";
import { failureKind } from "../../../../shell/RouteError";
import { readFrameMessage } from "../../../PageDetail/frameMessage";
import { classifyPageLink } from "../../../PageDetail/pageLink";
import { usePageLease } from "../../../PageDetail/usePageLease";

type NumberedThread = { number: number; thread: PageCommentThread };

const pinLabel = ({ number, thread }: NumberedThread) => {
	const author = thread.creator.displayName ?? thread.creator.name;
	const state = thread.resolved === null ? "open" : "resolved";
	const anchor =
		thread.selectedText === null ? `element ${thread.anchor.path}` : `selected text "${thread.selectedText}"`;
	return `Comment ${number}, ${author}, ${state}, ${anchor}`;
};

export function LeasedPageViewer({
	page,
	version,
	title,
	comments,
	selectedThread,
	onCommentAnchor,
	onCommentAnchorError,
	onOpenThread,
}: {
	page: string;
	version: number;
	title: string;
	comments: NumberedThread[];
	selectedThread: string | null;
	onCommentAnchor: (anchor: PageCommentThread["anchor"]) => void;
	onCommentAnchorError: (message: string) => void;
	onOpenThread: (thread: string) => void;
}) {
	const { lease, error, refreshes, retry } = usePageLease(page, version);
	const frame = useRef<HTMLIFrameElement>(null);
	const position = useRef({ x: 0, y: 0 });
	const [readyLease, setReadyLease] = useState<string | null>(null);
	const [timedOut, setTimedOut] = useState(false);
	const [link, setLink] = useState<ReturnType<typeof classifyPageLink>>(null);
	const [pinPositions, setPinPositions] = useState(new Map<string, { x: number; y: number }>());
	const theme = useTheme();
	const leaseId = lease?.id;
	const nonce = lease?.nonce;
	const navigate = useNavigate();
	const commentIds = useMemo(() => new Set(comments.map(({ thread }) => thread.id)), [comments]);
	const commentRevision = useMemo(
		() => comments.map(({ thread }) => `${thread.id}:${thread.updatedAt}`).join("/"),
		[comments],
	);
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
	const sendComments = useEffectEvent(() => {
		if (lease === null) return;
		frame.current?.contentWindow?.postMessage(
			{
				type: "page-comments-state",
				nonce: lease.nonce,
				comments: comments.map(({ thread }) => ({ thread: thread.id, anchor: thread.anchor })),
			},
			"*",
		);
	});
	const revealComment = useEffectEvent((thread: string) => {
		if (lease === null) return;
		frame.current?.contentWindow?.postMessage({ type: "page-comment-reveal", nonce: lease.nonce, thread }, "*");
	});
	const openComment = useEffectEvent(onCommentAnchor);
	const reportCommentAnchorError = useEffectEvent(onCommentAnchorError);
	const updateLayout = useEffectEvent((items: { thread: string; x: number; y: number }[]) => {
		setPinPositions(
			new Map(items.filter(({ thread }) => commentIds.has(thread)).map(({ thread, x, y }) => [thread, { x, y }])),
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
				sendComments();
			}
			if (message.type === "page-scroll") position.current = { x: message.x, y: message.y };
			if (message.type === "page-link")
				setLink((current) => current ?? classifyPageLink(message.href, location.origin));
			if (message.type === "page-comment-anchor") openComment(message.anchor);
			if (message.type === "page-comment-anchor-error") reportCommentAnchorError(message.message);
			if (message.type === "page-comment-layout") updateLayout(message.items);
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
	useEffect(() => {
		if (readyLease === leaseId) {
			void commentRevision;
			sendComments();
		}
	}, [commentRevision, leaseId, readyLease]);
	useEffect(() => {
		if (selectedThread !== null && readyLease === leaseId) revealComment(selectedThread);
	}, [leaseId, readyLease, selectedThread]);
	const failed = error !== null || timedOut;
	return (
		<>
			<div className="relative flex min-h-0 min-w-0 flex-1">
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
				{!failed && readyLease === lease?.id && (
					<div className="pointer-events-none absolute inset-0">
						{comments.map((comment) => {
							const position = pinPositions.get(comment.thread.id);
							return position === undefined ? null : (
								<PageCommentPin
									key={comment.thread.id}
									number={comment.number}
									label={pinLabel(comment)}
									x={position.x}
									y={position.y}
									resolved={comment.thread.resolved !== null}
									selected={selectedThread === comment.thread.id}
									onClick={() => onOpenThread(comment.thread.id)}
								/>
							);
						})}
					</div>
				)}
			</div>
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
