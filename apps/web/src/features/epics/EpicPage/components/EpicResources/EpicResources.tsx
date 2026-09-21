import { useQuery } from "@tanstack/react-query";
import type { Resource } from "@trellis/api";
import { useApp } from "../../../../../lib/appContext";
import { errorMessage } from "../../../../../lib/conflict";
import { useCollapsedGroups } from "../../../../table/hooks/useCollapsedGroups";
import { ResourceList } from "../../../ResourceList";

export type EpicResourcesProps = {
	// The pathname of the epic page, which keys the stored collapse state.
	routeKey: string;
	// The canonical ref of the epic, `TRL/trellis-for-one-human-and-many-agents`.
	epic: string;
	// The number of resources on the epic record. The header prints it while
	// the section is shut, so a shut section costs no request, and the header
	// keeps its width when the rows arrive.
	resourceCount: number;
};

const resourcesKey = "resources";
const collapsedResources: readonly string[] = [resourcesKey];
const noResources: readonly Resource[] = [];

// `resources.add` stores a url for a link and a blob for an image and a file.
// A doc carries its text in the record, so its row waits for the editor.
const resourceAddress = (resource: Resource): string | null => {
	if (resource.kind === "doc") return null;
	if (resource.kind === "link") return resource.url;
	return resource.blob!.url;
};

// The "Resources" section of the epic page: the resource list of the epic,
// under the header that collapses it. The collapse state lives in `uiStore`
// under `<routeKey>#resources`, and the section starts shut, because the band,
// the plan and the resources share one area that is at most half of the page
// card. `uiStore` writes the whole list of a key at the first toggle, so the
// resources take a key of their own, apart from the plan and the table groups.
// The list reads the resources of the epic only while the section is open.
// `trellis resource add` adds a resource, so the header carries no Add control.
export function EpicResources({ routeKey, epic, resourceCount }: EpicResourcesProps) {
	const { orpc } = useApp();
	const { isCollapsed, toggle } = useCollapsedGroups(`${routeKey}#resources`, collapsedResources);
	const open = !isCollapsed(resourcesKey);
	const list = useQuery({ ...orpc.resources.list.queryOptions({ input: { epic } }), enabled: open });
	const resources = list.data ?? noResources;
	return (
		<div className="px-5 pb-4 max-md:px-4">
			<ResourceList
				resources={resources}
				count={resourceCount}
				loading={open && list.isPending}
				error={list.error === null ? null : errorMessage(list.error)}
				open={open}
				onToggle={() => toggle(resourcesKey)}
				onOpen={(id) => {
					const address = resourceAddress(resources.find((resource) => resource.id === id)!);
					if (address !== null) window.open(address, "_blank", "noopener,noreferrer");
				}}
			/>
		</div>
	);
}
