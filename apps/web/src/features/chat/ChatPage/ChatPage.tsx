import { useMutation, useQuery } from "@tanstack/react-query";
import { type ChatMessage, chatChannelName, chatChannelPattern, type Project } from "@trellis/api";
import { cx, EmptyState, Input, toast } from "@trellis/ui";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
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

// The chat page of a project tree: the channels of its room on the left, the
// log of the open channel on the right, one input line below the log.
export function ChatPage({ project }: { project: Project }) {
	const { client, orpc, queryClient } = useApp();
	const [channel, setChannel] = useState("ai");
	const [draft, setDraft] = useState("");
	const log = useRef<HTMLOListElement>(null);
	const readOnly = project.archivedAt !== null;
	const channels = useQuery(orpc.chat.channels.queryOptions({ input: { project: project.path } }));
	const messages = useQuery(
		orpc.chat.list.queryOptions({ input: { project: project.path, channel, limit: LOG_LIMIT } }),
	);
	const items: ChatMessage[] = messages.data?.items ?? [];
	const invalidate = () => queryClient.invalidateQueries({ queryKey: orpc.chat.key() });
	const post = useMutation({
		mutationFn: (body: string) => client.chat.post({ project: project.path, channel, body }),
		onSuccess: () => {
			setDraft("");
			void invalidate();
		},
		onError: (error) => toast.error("Could not post the message", { description: error.message }),
	});
	const join = useMutation({
		mutationFn: (name: string) => client.chat.createChannel({ project: project.path, channel: name }),
		onSuccess: (created) => {
			setDraft("");
			setChannel(created.name);
			void invalidate();
		},
		onError: (error, name) => {
			// A join of a channel that exists opens it, as on IRC.
			if (channels.data?.some((existing) => existing.name === chatChannelName(name))) {
				setDraft("");
				setChannel(chatChannelName(name));
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
				<nav
					aria-label="Channels"
					className="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-border py-2 max-md:w-28"
				>
					{channels.isPending && <p className="px-3 py-1 font-mono text-sm text-fg-muted">…</p>}
					{channels.isError && (
						<p role="alert" className="px-3 py-1 font-mono text-sm text-danger">
							{channels.error.message}
						</p>
					)}
					<ul className="flex flex-col">
						{(channels.data ?? []).map((row) => (
							<li key={row.name}>
								<button
									type="button"
									aria-current={row.name === channel ? "page" : undefined}
									onClick={() => setChannel(row.name)}
									className={cx(
										"flex h-7 w-full items-center gap-2 px-3 font-mono text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11",
										row.name === channel ? "bg-elevated font-medium text-fg" : "text-fg-muted",
									)}
								>
									<span className="min-w-0 flex-1 truncate text-left">#{row.name}</span>
									<span className="text-xs text-fg-faint tabular">{row.messageCount}</span>
								</button>
							</li>
						))}
					</ul>
				</nav>
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
						{items.map((message) => (
							<ChatLine key={message.id} message={message} />
						))}
					</ol>
					<form onSubmit={submit} className="flex items-center gap-2 border-t border-border px-3 py-2">
						<span aria-hidden="true" className="shrink-0 font-mono text-sm text-fg-muted">
							#{channel}
						</span>
						<div className="min-w-0 flex-1">
							<Input
								label={`Message #${channel}`}
								hideLabel
								value={draft}
								disabled={readOnly}
								placeholder={readOnly ? "The project is archived." : "Message, or /join <channel>"}
								autoComplete="off"
								className="font-mono"
								onChange={(event) => setDraft(event.target.value)}
							/>
						</div>
					</form>
				</section>
			</div>
		</>
	);
}
