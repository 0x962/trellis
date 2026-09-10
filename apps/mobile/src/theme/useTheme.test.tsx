import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";
import { Appearance } from "react-native";
import { createMMKV } from "react-native-mmkv";
import { useTheme } from "./useTheme";

const store = createMMKV();

type SchemeChange = Parameters<typeof Appearance.addChangeListener>[0];

describe("useTheme", () => {
	beforeEach(() => {
		jest.restoreAllMocks();
	});

	test("starts dark on a fresh install", async () => {
		const { result } = await renderHook(() => useTheme());
		expect(result.current.mode).toBe("dark");
		expect(result.current.resolved).toBe("dark");
		expect(store.contains("trellis-theme")).toBe(false);
	});

	test("a theme change persists in MMKV and survives a remount", async () => {
		const first = await renderHook(() => useTheme());
		const second = await renderHook(() => useTheme());
		await act(() => first.result.current.setTheme("light"));
		expect(store.getString("trellis-theme")).toBe("light");
		expect(first.result.current.mode).toBe("light");
		expect(second.result.current.mode).toBe("light");
		await first.unmount();
		const remounted = await renderHook(() => useTheme());
		expect(remounted.result.current.mode).toBe("light");
		expect(remounted.result.current.resolved).toBe("light");
	});

	test("system mode follows Appearance and light stays selectable", async () => {
		let onChange: SchemeChange | undefined;
		const scheme = jest.spyOn(Appearance, "getColorScheme").mockReturnValue("light");
		jest.spyOn(Appearance, "addChangeListener").mockImplementation((listener) => {
			onChange = listener;
			return { remove: () => {} };
		});
		const { result } = await renderHook(() => useTheme());
		await act(() => result.current.setTheme("system"));
		expect(result.current.mode).toBe("system");
		expect(result.current.resolved).toBe("light");

		scheme.mockReturnValue("dark");
		await act(() => onChange?.({ colorScheme: "dark" }));
		expect(result.current.mode).toBe("system");
		expect(result.current.resolved).toBe("dark");

		await act(() => result.current.setTheme("light"));
		expect(result.current.mode).toBe("light");
		expect(result.current.resolved).toBe("light");
	});
});
