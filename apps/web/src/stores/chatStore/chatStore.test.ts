import { beforeEach, describe, expect, test } from "bun:test";
import { channelKey, chatStorageKey, createChatStore, isUnread, useChatStore } from "./chatStore";

const root = "01J8Z6X4Q3M2K1H0G9F8E7D6P1";

beforeEach(() => {
	localStorage.clear();
	useChatStore.setState(createChatStore().getState());
});

describe("stores/chatStore", () => {
	test("defaults: the sound is on, and nothing is remembered", () => {
		const state = createChatStore().getState();
		expect(state.sound).toBe(true);
		expect(state.openChannel).toEqual({});
		expect(state.drafts).toEqual({});
		expect(state.lastRead).toEqual({});
		expect(useChatStore.persist.getOptions().name).toBe(chatStorageKey);
	});

	test("the open channel, the drafts, and the read marks persist across store instances", () => {
		const store = createChatStore();
		store.getState().setSound(false);
		store.getState().setOpenChannel(root, "release");
		store.getState().setDraft(root, "ai", "half a thought");
		store.getState().markRead(root, "ai", "01J8Z6X4Q3M2K1H0G9F8E7D6M2");
		const again = createChatStore().getState();
		expect(again.sound).toBe(false);
		expect(again.openChannel[root]).toBe("release");
		expect(again.drafts[channelKey(root, "ai")]).toBe("half a thought");
		expect(again.lastRead[channelKey(root, "ai")]).toBe("01J8Z6X4Q3M2K1H0G9F8E7D6M2");
	});

	test("an empty draft leaves no entry", () => {
		const store = createChatStore();
		store.getState().setDraft(root, "ai", "x");
		store.getState().setDraft(root, "ai", "");
		expect(store.getState().drafts).toEqual({});
	});

	test("a read mark never moves backwards", () => {
		const store = createChatStore();
		store.getState().markRead(root, "ai", "01J8Z6X4Q3M2K1H0G9F8E7D6M5");
		store.getState().markRead(root, "ai", "01J8Z6X4Q3M2K1H0G9F8E7D6M2");
		expect(store.getState().lastRead[channelKey(root, "ai")]).toBe("01J8Z6X4Q3M2K1H0G9F8E7D6M5");
	});

	test("a channel is unread when its newest id is above the read mark, and never when it is empty", () => {
		const lastRead = { [channelKey(root, "ai")]: "01J8Z6X4Q3M2K1H0G9F8E7D6M2" };
		expect(isUnread(lastRead, root, "ai", "01J8Z6X4Q3M2K1H0G9F8E7D6M3")).toBe(true);
		expect(isUnread(lastRead, root, "ai", "01J8Z6X4Q3M2K1H0G9F8E7D6M2")).toBe(false);
		expect(isUnread(lastRead, root, "general", "01J8Z6X4Q3M2K1H0G9F8E7D6M1")).toBe(true);
		expect(isUnread(lastRead, root, "general", null)).toBe(false);
	});
});
