import { useQuery } from "@tanstack/react-query";
import type { Resource } from "@trellis/api";
import { useApp } from "../../../../../lib/appContext";
import { errorMessage } from "../../../../../lib/conflict";
import { ResourceList } from "../../../ResourceList";

export type EpicResourcesProps = {
	// The canonical ref of the epic, `TRL/trellis-for-one-human-and-many-agents`.
	epic: string;
};

const noResources: readonly Resource[] = [];

// The Resources tab of the epic page. The tab label names the list and
// prints the count, so the list draws no header. The tab mounts this
// component only while it is open, so a closed tab costs no request.
// `trellis resource add` adds a resource, so the tab carries no Add control.
export function EpicResources({ epic }: EpicResourcesProps) {
	const { orpc } = useApp();
	const list = useQuery(orpc.resources.list.queryOptions({ input: { epic } }));
	return (
		<ResourceList
			resources={list.data ?? noResources}
			loading={list.isPending}
			error={list.error === null ? null : errorMessage(list.error)}
			header={false}
		/>
	);
}
