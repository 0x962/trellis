import type { QueryClient } from "@tanstack/react-query";
import type { AppContext } from "../../lib/appContext";

// The unarchived projects that the sidebar draws. This stays as an explicit
// query helper so the Projects section keeps the TRL-362 loading and Retry
// behavior while the shared list-query defaults cover the other list views.
export const sidebarProjectsQuery = (orpc: AppContext["orpc"]) =>
	orpc.projects.list.queryOptions({ input: { archived: false }, retry: true });

// A new request for the sidebar project list, sent now. `refetch()` is not
// enough: while a query with no data waits between two tries, `refetch()`
// only lets that wait run on. A reset stops the wait, clears the failures,
// and starts a new fetch.
export const retrySidebarProjects = (queryClient: QueryClient, orpc: AppContext["orpc"]) =>
	queryClient.resetQueries({ queryKey: sidebarProjectsQuery(orpc).queryKey, exact: true });
