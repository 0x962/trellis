import { useMutation, useQuery } from "@tanstack/react-query";
import { type ChatMessage, chatChannelName, chatChannelPattern, type Project } from "@trellis/api";
import { EmptyState, Input, toast } from "@trellis/ui";
import { type FormEvent, type ReactNode, useEffect, useRef } from "react";
import { useApp } from "../../../lib/appContext";
import { useChatStore } from "../../../stores/chatStore";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { useChatUnread } from "../useChatUnread";
import { ChannelList } from "./components/ChannelList";
import { ChatLine } from "./components/ChatLine";

// The log holds the newest messages of the channel. The server caps a read
// at this many.
const LOG_LIMIT = 200;

// `/join name` creates a channel and opens it, as on IRC. Every other line
// is a message to the open channel.
const parseInput = (text: string): { kind: "join"; channel: string } | { kind: "post"; body: string } | null => {
	const trimmed = text.trim();
	if (trimmed === "") return null;
	const join = /^\/join\s+(\S+)$/i.exec(trimmed);
	if (join !== null) return { kind: "join", channel: join[1]! };
	return { kind: "post", body: text.trimEnd() };
};

const day = (iso: string) => iso.slice(0, 10);

// The lines of the log, with a dated rule before the first message of each
// day, so a reader scanning across days sees where one ended.
const withDayRules = (items: ChatMessage[], onMention: (text: string) => void): ReactNode[] =>
	items.flatMap((message, index) => {
		const line = <ChatLine key={message.id} message={message} onMention={onMention} />;
		if (index > 0 && day(items[index - 1]!.createdAt) === day(message.createdAt)) return [line];
		return [
			<li
				key={`${message.id}.day`}
				aria-hidden="true"
				className="flex items-center gap-2 px-3 py-1 font-mono text-xs text-fg-faint tabular"
			>
				<span className="h-px flex-1 bg-border" />
				{day(message.createdAt)}
				<span className="h-px flex-1 bg-border" />
			</li>,
			line,
		];
	});

// The chat page of a project tree: the channels of its room on the left, the
// log of the open channel on the right, one input line below the log. The
// open channel, the unsent text of each channel, and the read position come
// back on the next visit from the chat store.
export function ChatPage({ project }: { project: Project }) {
	const { client, orpc, queryClient } = useApp();
	const rootId = project.rootId;
	const channel = useChatStore((state) => state.openChannel[rootId] ?? "ai");
	const draft = useChatStore((state) => state.drafts[`${rootId}:${channel}`] ?? "");
	const { setOpenChannel, setDraft, markRead } = useChatStore.getState();
	const log = useRef<HTMLOListElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const readOnly = project.archivedAt !== null;
	const { channels, unread } = useChatUnread(rootId);
	const messages = useQuery(
		orpc.chat.list.queryOptions({ input: { project: project.path, channel, limit: LOG_LIMIT } }),
	);
	const items: ChatMessage[] = messages.data?.items ?? [];
	const invalidate = () => queryClient.invalidateQueries({ queryKey: orpc.chat.key() });
	const post = useMutation({
		mutationFn: (body: string) => client.chat.post({ project: project.path, channel, body }),
		onSuccess: () => {
			setDraft(rootId, channel, "");
			void invalidate();
		},
		onError: (error) => toast.error("Could not post the message", { description: error.message }),
	});
	const join = useMutation({
		mutationFn: (name: string) => client.chat.createChannel({ project: project.path, channel: name }),
		onSuccess: (created) => {
			setDraft(rootId, channel, "");
			setOpenChannel(rootId, created.name);
			void invalidate();
		},
		onError: (error, name) => {
			// A join of a channel that exists opens it, as on IRC.
			if (channels.data?.some((existing) => existing.name === chatChannelName(name))) {
				setDraft(rootId, channel, "");
				setOpenChannel(rootId, chatChannelName(name));
				return;
			}
			toast.error(`Could not create #${chatChannelName(name)}`, { description: error.message });
		},
	});

	// A new line at the end of the log scrolls into view when the reader was
	// at the end. A reader who scrolled up keeps their place. A channel
	// switch always opens at the end.
	const scrolledChannel = useRef<string | null>(null);
	useEffect(() => {
		const element = log.current;
		const data = messages.data;
		if (element === null || data === undefined) return;
		const switched = scrolledChannel.current !== data.channel;
		const nearEnd = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
		if (switched || nearEnd) element.scrollTop = element.scrollHeight;
		scrolledChannel.current = data.channel;
	}, [messages.data]);

	// The open channel counts as read while the tab is visible. A tab in the
	// background keeps its unread dot until the reader comes back.
	useEffect(() => {
		const latest = messages.data?.latestId;
		if (latest === undefined || latest === null) return;
		const mark = () => {
			if (document.visibilityState === "visible") markRead(rootId, messages.data!.channel, latest);
		};
		mark();
		document.addEventListener("visibilitychange", mark);
		return () => document.removeEventListener("visibilitychange", mark);
	}, [messages.data, rootId, markRead]);

	const mention = (text: string) => {
		setDraft(rootId, channel, `${draft}${draft === "" || draft.endsWith(" ") ? "" : " "}${text}`);
		input.current?.focus();
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const parsed = parseInput(draft);
		if (parsed === null || post.isPending || join.isPending) return;
		if (parsed.kind === "join") {
			if (!chatChannelPattern.test(parsed.channel)) {
				toast.error("A channel name holds 1 to 32 letters, digits, _ and -.");
				return;
			}
			join.mutate(parsed.channel);
			return;
		}
		post.mutate(parsed.body);
	};

	return (
		<>
			<Topbar>
				<PageTitle parent={<ProjectBreadcrumb project={project} />} title="Chat" />
				<span className="font-mono text-sm text-fg-muted">#{channel}</span>
			</Topbar>
			<div className="page-card flex flex-1 overflow-hidden">
				<ChannelList
					channels={channels.data ?? []}
					open={channel}
					unread={unread}
					pending={channels.isPending}
					error={channels.isError ? channels.error.message : null}
					onOpen={(name) => setOpenChannel(rootId, name)}
				/>
				<section aria-label={`#${channel} log`} className="flex min-w-0 flex-1 flex-col">
					<ol ref={log} className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
						{messages.isPending && <li className="px-3 font-mono text-sm text-fg-muted">Load #{channel}…</li>}
						{messages.isError && (
							<li role="alert" className="px-3 font-mono text-sm text-danger">
								{messages.error.message}
							</li>
						)}
						{messages.isSuccess && items.length === 0 && (
							<li className="flex flex-1 items-center justify-center">
								<EmptyState
									variant="page"
									title={`#${channel} is quiet`}
									description="No message yet. Agents and people post here."
								/>
							</li>
						)}
						{withDayRules(items, mention)}
					</ol>
					<form onSubmit={submit} className="flex items-center gap-2 border-t border-border px-3 py-2">
						<span aria-hidden="true" className="w-16 shrink-0 truncate font-mono text-sm text-fg-muted">
							#{channel}
						</span>
						<div className="min-w-0 flex-1">
							<Input
								ref={input}
								label={`Message #${channel}`}
								hideLabel
								value={draft}
								disabled={readOnly}
								placeholder={readOnly ? "The project is archived." : "Message, or /join <channel>"}
								autoComplete="off"
								className="font-mono"
								onChange={(event) => setDraft(rootId, channel, event.target.value)}
							/>
						</div>
					</form>
				</section>
			</div>
		</>
	);
}
