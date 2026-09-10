import type { QueryClient } from "@tanstack/react-query";
import type { Scheduler, TrellisClient } from "@trellis/api";
import { createContext, type ReactNode, useContext } from "react";
import type { Live } from "./live";
import type { Orpc } from "./orpc";

// What every route loader and every component reaches for: the query
// client, the oRPC utils, the raw client, the live connection, and the
// clock. The router carries it as its context; `AppProvider` hands the
// same object to components.
export type AppContext = {
	queryClient: QueryClient;
	orpc: Orpc;
	client: TrellisClient;
	live: Live;
	scheduler: Scheduler;
};

export type RouterContext = AppContext;

const Context = createContext<AppContext | null>(null);

export function AppProvider({ value, children }: { value: AppContext; children: ReactNode }) {
	return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useApp = (): AppContext => useContext(Context)!;
