import { LockSimple } from "@phosphor-icons/react";
import type { ChatChannel } from "@trellis/api";
import { ActivityDot, Avatar, cx, SectionHeader } from "@trellis/ui";

export type ChannelListProps = {
	channels: ChatChannel[];
	// The persona name of the manager of the project, which labels the
	// direct message channel.
	managerName: string;
	open: string;
	unread: ReadonlySet<string>;
	pending: boolean;
	error: string | null;
	onOpen: (name: string) => void;
};

// The channels of the room in three groups: the channels everyone posts in
// first, with no heading, then Direct messages with the manager, then the
// AI heading and the channels for agents only. A channel for agents carries
// a lock in place of the `#`; the direct message carries the manager's mark
// and name. A row shows a dot when the channel holds unread messages, and
// its message count.
export function ChannelList({ channels, managerName, open, unread, pending, error, onOpen }: ChannelListProps) {
	const shared = channels.filter((channel) => !channel.aiOnly && !channel.direct);
	const directs = channels.filter((channel) => channel.direct);
	const agents = channels.filter((channel) => channel.aiOnly && !channel.direct);
	const row = (channel: ChatChannel) => {
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
					<span className="flex min-w-0 flex-1 items-center gap-1 text-left">
						{channel.direct ? (
							<Avatar
								kind="agent"
								name={managerName}
								personaKind="manager"
								state="static"
								className="size-4 shrink-0"
							/>
						) : channel.aiOnly ? (
							<LockSimple aria-label="agents only" weight="fill" className="size-3 shrink-0" />
						) : (
							<span aria-hidden="true">#</span>
						)}
						<span className="min-w-0 truncate">{channel.direct ? managerName : channel.name}</span>
					</span>
					{dot && <ActivityDot label="Unread messages" placement="inline" />}
					<span className="text-xs text-fg-faint tabular">{channel.messageCount}</span>
				</button>
			</li>
		);
	};
	return (
		<nav
			aria-label="Channels"
			className="flex w-48 shrink-0 flex-col overflow-y-auto border-r border-border py-2 max-md:w-32"
		>
			{pending && <p className="px-3 py-1 font-mono text-sm text-fg-muted">…</p>}
			{error !== null && (
				<p role="alert" className="px-3 py-1 font-mono text-sm text-danger">
					{error}
				</p>
			)}
			<ul className="flex flex-col">{shared.map(row)}</ul>
			{directs.length > 0 && (
				<>
					<SectionHeader title="Direct messages" level={3} className="mt-3 px-3" />
					<ul className="flex flex-col">{directs.map(row)}</ul>
				</>
			)}
			{agents.length > 0 && (
				<>
					<SectionHeader title="AI" level={3} className="mt-3 px-3" />
					<ul className="flex flex-col">{agents.map(row)}</ul>
				</>
			)}
		</nav>
	);
}
