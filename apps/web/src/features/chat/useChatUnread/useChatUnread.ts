import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../lib/appContext";
import { isUnread, useChatStore } from "../../../stores/chatStore";

// The channels of one project room, with the unread flag of each. A channel
// for agents only is never unread: a person reads it when they want.
export const useChatUnread = (rootId: string) => {
	const { orpc } = useApp();
	const channels = useQuery(orpc.chat.channels.queryOptions({ input: { project: rootId } }));
	const lastRead = useChatStore((state) => state.lastRead);
	const unread = new Set(
		(channels.data ?? [])
			.filter((channel) => !channel.aiOnly && isUnread(lastRead, rootId, channel.name, channel.latestId))
			.map((channel) => channel.name),
	);
	return { channels, unread };
};
