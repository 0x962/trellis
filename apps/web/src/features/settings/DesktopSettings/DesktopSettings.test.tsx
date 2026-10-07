import { afterAll, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "test-renderer";
import type { DesktopSettingsBridge } from "../../../lib/desktopBridge";
import { DesktopSettings } from "./DesktopSettings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hadWindow = "window" in globalThis;
const originalWindow = globalThis.window;
globalThis.window = {
	addEventListener() {},
	removeEventListener() {},
} as unknown as Window & typeof globalThis;

afterAll(() => {
	if (hadWindow) globalThis.window = originalWindow;
	else Reflect.deleteProperty(globalThis, "window");
});

const settle = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
	});

test("Retry repeats the desktop status request after a failure", async () => {
	const status = mock(async () => {
		throw new Error("Error invoking remote method 'desktop:status': Error: Host offline");
	});
	const bridge: DesktopSettingsBridge = {
		status,
		setOpenAtLogin: async () => {},
		run: async () => {},
	};
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const root = createRoot();
	await act(async () => {
		root.render(
			<QueryClientProvider client={queryClient}>
				<DesktopSettings bridge={bridge} />
			</QueryClientProvider>,
		);
	});
	await settle();
	try {
		const text = () => JSON.stringify(root.container.toJSON());
		expect(text()).toContain("Desktop settings are unavailable.");
		expect(text()).toContain("Host offline");
		const retry = root.container.queryAll((node) => node.type === "button")[0]!;
		expect(retry).toBeDefined();

		await act(async () => retry.props.onClick());
		await settle();

		expect(status).toHaveBeenCalledTimes(2);
		expect(text()).toContain("Desktop settings are unavailable.");
	} finally {
		await act(async () => root.unmount());
		queryClient.clear();
	}
});
