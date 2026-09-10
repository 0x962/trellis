import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NeedsYou } from "../src/needs-you/NeedsYou";

// A query client for one test: no retries, so a failed request settles at
// once, and nothing goes stale on its own, as in the app. The cache never
// collects a query: a collection timer would outlive the test and keep the
// jest worker alive. Each test makes its own client, so nothing piles up.
export const testQueryClient = () =>
	new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, gcTime: Number.POSITIVE_INFINITY },
		},
	});

// Renders the Needs you screen the way the tab does, under a gesture root
// and a query client provider.
export const renderNeedsYou = async (queryClient = testQueryClient()) => {
	const view = await render(
		<GestureHandlerRootView>
			<QueryClientProvider client={queryClient}>
				<NeedsYou />
			</QueryClientProvider>
		</GestureHandlerRootView>,
	);
	return { ...view, queryClient };
};

// The identifiers of the rows on screen, in list order.
export const rowIdentifiers = () =>
	screen.queryAllByTestId(/^inbox-row-/).map((row) => String(row.props.testID).replace("inbox-row-", ""));

export const sectionHeader = (name: string) => screen.getByRole("button", { name });
