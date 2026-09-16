import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const chatStorageKey = "trellis-chat";

// The key of one channel: the root project id and the channel name.
export const channelKey = (rootId: string, channel: string) => `${rootId}:${channel}`;

// The persisted values.
export type ChatData = {
	// Play a tone when a message from someone else arrives.
	sound: boolean;
	// The channel the chat page opens per root project. A root with no
	// entry opens #ai.
	openChannel: Record<string, string>;
	// The unsent input text per channel.
	drafts: Record<string, string>;
	// The id of the newest message the reader saw per channel. A channel whose
	// newest message id is above this value has unread messages.
	lastRead: Record<string, string>;
};

export type ChatState = ChatData & {
	setSound: (sound: boolean) => void;
	setOpenChannel: (rootId: string, channel: string) => void;
	setDraft: (rootId: string, channel: string, draft: string) => void;
	markRead: (rootId: string, channel: string, latestId: string) => void;
};

const defaults: ChatData = { sound: true, openChannel: {}, drafts: {}, lastRead: {} };

// A draft that is empty leaves no entry, so the store does not grow with
// every channel a reader opens.
const withDraft = (drafts: Record<string, string>, key: string, draft: string) => {
	const { [key]: _gone, ...rest } = drafts;
	return draft === "" ? rest : { ...rest, [key]: draft };
};

export const createChatStore = () =>
	create<ChatState>()(
		persist(
			(set) => ({
				...defaults,
				setSound: (sound) => set({ sound }),
				setOpenChannel: (rootId, channel) =>
					set((state) => ({ openChannel: { ...state.openChannel, [rootId]: channel } })),
				setDraft: (rootId, channel, draft) =>
					set((state) => ({ drafts: withDraft(state.drafts, channelKey(rootId, channel), draft) })),
				markRead: (rootId, channel, latestId) =>
					set((state) => {
						const key = channelKey(rootId, channel);
						const seen = state.lastRead[key];
						if (seen !== undefined && seen >= latestId) return {};
						return { lastRead: { ...state.lastRead, [key]: latestId } };
					}),
			}),
			{
				name: chatStorageKey,
				storage: createJSONStorage(() => localStorage),
				partialize: (state) => ({
					sound: state.sound,
					openChannel: state.openChannel,
					drafts: state.drafts,
					lastRead: state.lastRead,
				}),
			},
		),
	);

export const useChatStore = createChatStore();

// True when the channel holds a message the reader has not seen. A channel
// with no message is never unread.
export const isUnread = (
	lastRead: Record<string, string>,
	rootId: string,
	channel: string,
	latestId: string | null,
) => {
	if (latestId === null) return false;
	const seen = lastRead[channelKey(rootId, channel)];
	return seen === undefined || seen < latestId;
};
