import { useMutation, useQuery } from "@tanstack/react-query";
import { type ChatMessage, chatChannelName, chatChannelPattern, type Project } from "@trellis/api";
import { EmptyState, Separator, toast } from "@trellis/ui";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { useApp } from "../../../lib/appContext";
import { createMarkdownRenderer } from "../../../lib/markdown";
import { useChatStore } from "../../../stores/chatStore";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { ChatComposer } from "../ChatComposer";
import { agentCandidates, roleCandidates } from "../ChatComposer/mentionQuery";
import { useChatUnread } from "../useChatUnread";
import { ChannelList } from "./components/ChannelList";
import { ChatLine } from "./components/ChatLine";
import { dayRules } from "./utils/dayRules";

// The log holds the newest messages of the channel. The server caps a read
// at this many.
const LOG_LIMIT = 200;

// `/join name` creates a channel and opens it, as on IRC. Every other text
// is a message to the open channel.
const parseInput = (text: string): { kind: "join"; channel: string } | { kind: "post"; body: string } | null => {
	const trimmed = text.trim();
	if (trimmed === "") return null;
	const join = /^\/join\s+(\S+)$/i.exec(trimmed);
	if (join !== null) return { kind: "join", channel: join[1]! };
	return { kind: "post", body: text.trimEnd() };
};

// The lines of the log, with a dated rule before the first message of each
// day, so a reader scanning across days sees where one ended. dayRules picks
// the days; this adds the markup.
const withDayRules = (
	items: ChatMessage[],
	render: (markdown: string) => string,
	onMention: (text: string) => void,
): ReactNode[] =>
	dayRules(items).flatMap(({ item, day, startsDay }) => {
		const line = <ChatLine key={item.id} message={item} render={render} onMention={onMention} />;
		if (!startsDay) return [line];
		return [
			<li
				key={`${item.id}.day`}
				aria-hidden="true"
				className="flex items-center gap-2 px-3 py-1 font-mono text-xs text-fg-faint tabular"
			>
				<Separator className="flex-1" />
				{day}
				<Separator className="flex-1" />
			</li>,
			line,
		];
	});

// The chat page of a project tree: the channels of its room on the left, the
// log of the open channel on the right, the composer below the log. The
// open channel, the unsent text of each channel, and the read position come
// back on the next visit from the chat store. A channel for agents only has
// no composer: a person reads it.
export function ChatPage({ project }: { project: Project }) {
	const { client, orpc, queryClient } = useApp();
	const rootId = project.id;
	const channel = useChatStore((state) => state.openChannel[rootId] ?? "ai");
	const draft = useChatStore((state) => state.drafts[`${rootId}:${channel}`] ?? "");
	const { setOpenChannel, setDraft, markRead } = useChatStore.getState();
	const log = useRef<HTMLOListElement>(null);
	const textarea = useRef<HTMLTextAreaElement>(null);
	const readOnly = project.archivedAt !== null;
	const { channels, unread } = useChatUnread(rootId);
	const open = channels.data?.find((row) => row.name === channel);
	const messages = useQuery(
		orpc.chat.list.queryOptions({ input: { project: project.path, channel, limit: LOG_LIMIT } }),
	);
	const agents = useQuery(orpc.agentRuns.list.queryOptions({ input: { project: project.path } }));
	// Every list below is a dependency of a memo, so it holds its identity
	// while the query answer stays the same. A new array on each draw would
	// rebuild the markdown renderer and reformat every clock of the log.
	const live = useMemo(
		() =>
			(agents.data ?? []).filter(
				(run) => run.projectId === project.id && (run.state === "running" || run.state === "starting"),
			),
		[agents.data, project.id],
	);
	// The manager of the project names the direct message channel. A project
	// with no manager yet shows the default name.
	const managerName =
		(agents.data ?? []).find((run) => run.projectId === project.id && run.kind === "manager")?.personaName ?? "Copilot";
	const memberCount = open?.direct ? live.filter((run) => run.kind === "manager").length : live.length;
	const memberLabel = agents.isPending
		? "… members"
		: agents.isError
			? "? members"
			: `${memberCount} ${memberCount === 1 ? "member" : "members"}`;
	const items: ChatMessage[] = useMemo(() => messages.data?.items ?? [], [messages.data]);

	// The names a mention in a body can address: the live agents by persona
	// name and run id, the roles, and every author in the loaded log.
	const render = useMemo(() => {
		const names = new Set<string>(roleCandidates.map((role) => role.label));
		for (const run of live) {
			names.add(run.personaName);
			names.add(run.id);
		}
		for (const message of items) {
			names.add(message.actor.displayName ?? message.actor.name);
			names.add(message.actor.name);
		}
		return createMarkdownRenderer({ mentions: [...names] });
	}, [live, items]);
	const candidates = useMemo(() => [...agentCandidates(live), ...roleCandidates], [live]);

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

	// A click on a name appends the mention to the unsent text. The text
	// comes from the store and not from the `draft` of this draw, so one
	// keystroke does not give every line of the log a new onMention.
	const aiOnly = open?.aiOnly === true;
	const mention = useCallback(
		(text: string) => {
			if (aiOnly) return;
			const unsent = useChatStore.getState().drafts[`${rootId}:${channel}`] ?? "";
			setDraft(rootId, channel, `${unsent}${unsent === "" || unsent.endsWith(" ") ? "" : " "}${text}`);
			textarea.current?.focus();
		},
		[aiOnly, rootId, channel, setDraft],
	);
	const lines = useMemo(() => withDayRules(items, render, mention), [items, render, mention]);

	const submit = () => {
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
				<span className="font-mono text-sm text-fg-muted">{open?.direct ? managerName : `#${channel}`}</span>
				<span className="w-20 shrink-0 font-mono text-xs text-fg-faint tabular">{memberLabel}</span>
			</Topbar>
			<div className="page-card flex flex-1 overflow-hidden">
				<ChannelList
					channels={channels.data ?? []}
					managerName={managerName}
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
									description={
										open?.direct
											? `No message yet. Write to ${managerName}; the message interrupts it.`
											: open?.aiOnly
												? "No message yet. Agents post here."
												: "No message yet. Agents and people post here."
									}
								/>
							</li>
						)}
						{lines}
					</ol>
					{open?.aiOnly ? (
						<p className="border-t border-border px-3 py-3 font-mono text-sm text-fg-muted">
							#{channel} is for agents. You read it; agents post in it.
						</p>
					) : (
						<ChatComposer
							project={project.path}
							channel={channel}
							value={draft}
							onChange={(value) => setDraft(rootId, channel, value)}
							onSubmit={submit}
							disabled={readOnly}
							candidates={candidates}
							textareaRef={textarea}
						/>
					)}
				</section>
			</div>
		</>
	);
}
