import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../lib/appContext";

// The projects the flow project select offers. A dialog that creates a flow
// reads the same query, so it can hold its submit button while the list is
// missing.
export const useFlowProjects = () => {
	const { orpc } = useApp();
	return useQuery(orpc.projects.list.queryOptions({ input: {} }));
};
