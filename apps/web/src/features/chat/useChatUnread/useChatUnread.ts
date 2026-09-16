import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../lib/appContext";
import { isUnread, useChatStore } from "../../../stores/chatStore";

// The channels of one root project room, with the unread flag of each. Every
// project of a tree asks with the root id, so one tree makes one request.
export const useChatUnread = (rootId: string) => {
	const { orpc } = useApp();
	const channels = useQuery(orpc.chat.channels.queryOptions({ input: { project: rootId } }));
	const lastRead = useChatStore((state) => state.lastRead);
	const unread = new Set(
		(channels.data ?? [])
			.filter((channel) => isUnread(lastRead, rootId, channel.name, channel.latestId))
			.map((channel) => channel.name),
	);
	return { channels, unread };
};
