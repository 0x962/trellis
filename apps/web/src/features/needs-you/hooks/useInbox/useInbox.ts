import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../lib/appContext";

// The home screen reads every project at once, so the input is empty and
// every section shares one cache entry.
export const inboxInput = {};

// The four Needs you sections. One read serves the page, the sidebar badge,
// and every section on it.
export const useInbox = () => {
	const { orpc } = useApp();
	return useQuery(orpc.inbox.get.queryOptions({ input: inboxInput }));
};
