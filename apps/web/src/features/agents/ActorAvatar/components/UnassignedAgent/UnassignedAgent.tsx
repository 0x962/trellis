import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../../lib/appContext";
import { AssignAgent } from "../../../AssignAgent";

export function UnassignedAgent({ identifier, projectKey }: { identifier: string; projectKey: string }) {
	const { orpc } = useApp();
	const projects = useQuery(orpc.projects.list.queryOptions({ input: { archived: true } }));
	if (!projects.isSuccess || projects.data.some((project) => project.key === projectKey)) return null;
	return <AssignAgent ticket={identifier} disabled={false} compact />;
}
