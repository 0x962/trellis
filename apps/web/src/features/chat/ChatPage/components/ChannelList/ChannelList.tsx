import type { ChatChannel } from "@trellis/api";
import { ActivityDot, cx, SectionHeader } from "@trellis/ui";

export type ChannelListProps = {
	channels: ChatChannel[];
	open: string;
	unread: ReadonlySet<string>;
	pending: boolean;
	error: string | null;
	onOpen: (name: string) => void;
};

// The channels of the room, one row each: the name, a dot when the channel
// holds unread messages, and its message count.
export function ChannelList({ channels, open, unread, pending, error, onOpen }: ChannelListProps) {
	return (
		<nav
			aria-label="Channels"
			className="flex w-48 shrink-0 flex-col overflow-y-auto border-r border-border max-md:w-32"
		>
			<SectionHeader title="Channels" count={pending ? undefined : channels.length} level={2} className="px-3 pt-2" />
			{pending && <p className="px-3 py-1 font-mono text-sm text-fg-muted">…</p>}
			{error !== null && (
				<p role="alert" className="px-3 py-1 font-mono text-sm text-danger">
					{error}
				</p>
			)}
			<ul className="flex flex-col py-1">
				{channels.map((channel) => {
					const current = channel.name === open;
					const dot = !current && unread.has(channel.name);
					return (
						<li key={channel.name}>
							<button
								type="button"
								aria-current={current ? "page" : undefined}
								onClick={() => onOpen(channel.name)}
								className={cx(
									"flex h-7 w-full items-center gap-2 px-3 font-mono text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11",
									current ? "bg-elevated text-fg" : dot ? "font-medium text-fg" : "text-fg-muted",
								)}
							>
								<span className="min-w-0 flex-1 truncate text-left">#{channel.name}</span>
								{dot && <ActivityDot label="Unread messages" placement="inline" />}
								<span className="text-xs text-fg-faint tabular">{channel.messageCount}</span>
							</button>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
