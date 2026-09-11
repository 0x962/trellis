import { beforeEach, describe, expect, test } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";
import { store } from "../store";
import { useStoredString } from "./useStoredString";

const key = "trellis-server-url";

describe("useStoredString", () => {
	beforeEach(() => {
		store.clearAll();
	});

	test("a key the store holds nothing for reads undefined", async () => {
		const { result } = await renderHook(() => useStoredString(key));
		expect(result.current[0]).toBeUndefined();
	});

	// The first render paints the stored value, so a screen that reads the
	// server URL never shows the setup screen for one frame.
	test("a stored value is there on the first render", async () => {
		store.set(key, "http://h:4521");
		const { result } = await renderHook(() => useStoredString(key));
		expect(result.current[0]).toBe("http://h:4521");
	});

	test("a write through the hook reaches the store and every mounted reader", async () => {
		const writer = await renderHook(() => useStoredString(key));
		const reader = await renderHook(() => useStoredString(key));
		await act(() => writer.result.current[1]("http://h:4521"));
		expect(store.getString(key)).toBe("http://h:4521");
		expect(writer.result.current[0]).toBe("http://h:4521");
		expect(reader.result.current[0]).toBe("http://h:4521");
	});

	test("a write straight to the store reaches every mounted reader", async () => {
		const { result } = await renderHook(() => useStoredString(key));
		await act(() => {
			store.set(key, "http://other:4521");
		});
		expect(result.current[0]).toBe("http://other:4521");
	});

	// `undefined` takes the value back out, which is what a reset does.
	test("a write of undefined removes the value", async () => {
		store.set(key, "http://h:4521");
		const { result } = await renderHook(() => useStoredString(key));
		await act(() => result.current[1](undefined));
		expect(store.contains(key)).toBe(false);
		expect(result.current[0]).toBeUndefined();
	});

	// A change to another key leaves this reader's value alone.
	test("a change to another key changes nothing", async () => {
		store.set(key, "http://h:4521");
		const { result } = await renderHook(() => useStoredString(key));
		await act(() => {
			store.set("trellis-actor-name", "dana");
		});
		expect(result.current[0]).toBe("http://h:4521");
	});

	// The hook drops its listener on unmount, so a store that outlives a
	// screen holds no reference to it.
	test("an unmounted hook hears nothing", async () => {
		const { result, unmount } = await renderHook(() => useStoredString(key));
		await unmount();
		await act(() => {
			store.set(key, "http://h:4521");
		});
		expect(result.current[0]).toBeUndefined();
	});
});
