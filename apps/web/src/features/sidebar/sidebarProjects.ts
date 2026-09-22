import type { QueryClient } from "@tanstack/react-query";
import type { AppContext } from "../../lib/appContext";

// The unarchived projects that the sidebar draws. The app query client never
// retries a query, so one failed request, such as a request to a host that
// still starts, would leave the Projects section empty until an event
// refreshes the list. This query retries until the server answers. React
// Query waits 1 s, 2 s, 4 s and so on between the tries, and never more
// than 30 s.
//
// `SidebarBody` and `ProjectTree` read this one query. The component that
// starts the request sets the retry rule, so both must pass these options.
export const sidebarProjectsQuery = (orpc: AppContext["orpc"]) =>
	orpc.projects.list.queryOptions({ input: { archived: false }, retry: true });

// A new request for the sidebar project list, sent now. `refetch()` is not
// enough: while a query with no data waits between two tries, `refetch()`
// only lets that wait run on. A reset stops the wait, clears the failures,
// and starts a new fetch.
export const retrySidebarProjects = (queryClient: QueryClient, orpc: AppContext["orpc"]) =>
	queryClient.resetQueries({ queryKey: sidebarProjectsQuery(orpc).queryKey, exact: true });
