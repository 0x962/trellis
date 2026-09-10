import { QueryClientProvider } from "@tanstack/react-query";
import { RouterContextProvider } from "@tanstack/react-router";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProvider } from "../src/lib/appContext";
import { type ProviderOptions, wire } from "./renderWithProviders";

// Runs a hook inside the providers the app mounts, over the fake server and
// a memory-history router at `path`. `rerender` takes the hook's next input.
export const renderHookWithProviders = <Input, Output>(
	hook: (input: Input) => Output,
	input: Input,
	options: ProviderOptions,
) => {
	const wired = wire(options);
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={wired.queryClient}>
			<AppProvider value={wired.context}>
				<RouterContextProvider router={wired.router}>{children}</RouterContextProvider>
			</AppProvider>
		</QueryClientProvider>
	);
	const view = renderHook(hook, { initialProps: input, wrapper });
	return { ...view, ...wired };
};
