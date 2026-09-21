import type { Resource } from "@trellis/api";
import { type ResourceListRow, ResourceList as ResourceListView } from "@trellis/ui";
import { useMemo, useState } from "react";
import { DocSheet } from "./components/DocSheet";
import { LinkBrowserSheet } from "./components/LinkBrowserSheet";
import { resourceDetail } from "./resourceDetail";
import { resourceUrl } from "./resourceUrl";

export type ResourceListProps = {
	// The resources of the epic, in the order the server returns them.
	resources: readonly Resource[];
	count?: number;
	loading?: boolean;
	error?: string | null;
	expanded?: boolean;
	onToggle?: () => void;
	headerClassName?: string;
	onAdd?: {
		doc: () => void;
		link: () => void;
		file: () => void;
	};
};

export type ResourceOpenAction = "doc" | "link-sheet" | "new-tab" | "download";

export const resourceOpenAction = (resource: Resource, desktop: boolean): ResourceOpenAction => {
	if (resource.kind === "doc") return "doc";
	if (resource.kind === "link") return desktop ? "link-sheet" : "new-tab";
	return resource.kind === "image" ? "new-tab" : "download";
};

export function ResourceList({
	resources,
	count,
	loading,
	error,
	expanded,
	onToggle,
	headerClassName,
	onAdd,
}: ResourceListProps) {
	const [doc, setDoc] = useState<Resource | null>(null);
	const [link, setLink] = useState<Resource | null>(null);
	const rows = useMemo<ResourceListRow[]>(
		() =>
			resources.map((resource) => ({
				id: resource.id,
				kind: resource.kind,
				name: resource.name,
				detail: resourceDetail(resource),
				pullRequest: resource.pullRequestNumber,
			})),
		[resources],
	);
	const onOpen = (id: string) => {
		const resource = resources.find((item) => item.id === id)!;
		const desktop = (window as Window & { trellisDesktop?: unknown }).trellisDesktop !== undefined;
		switch (resourceOpenAction(resource, desktop)) {
			case "doc":
				setDoc(resource);
				return;
			case "link-sheet":
				setLink(resource);
				return;
			case "new-tab":
				window.open(resourceUrl(resource)!, "_blank", "noopener,noreferrer");
				return;
			case "download": {
				const anchor = document.createElement("a");
				anchor.href = resourceUrl(resource)!;
				anchor.download = resource.name;
				anchor.click();
			}
		}
	};
	return (
		<>
			<ResourceListView
				rows={rows}
				count={count}
				loading={loading}
				error={error}
				expanded={expanded}
				onToggle={onToggle}
				headerClassName={headerClassName}
				onOpen={onOpen}
				onAdd={onAdd}
			/>
			{doc !== null && <DocSheet key={doc.id} resource={doc} onClose={() => setDoc(null)} />}
			{link !== null && <LinkBrowserSheet name={link.name} url={link.url!} onClose={() => setLink(null)} />}
		</>
	);
}
