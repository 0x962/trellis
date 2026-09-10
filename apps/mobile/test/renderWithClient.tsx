import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { queryClient } from "../src/lib/queryClient";

// Renders one component under the query client the whole app shares, so a
// test patches the same cache the screens read.
export const renderWithClient = (element: ReactElement) =>
	render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
