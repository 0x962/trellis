import type { Resource } from "@trellis/api";
import { type ResourceListRow, ResourceList as ResourceListView } from "@trellis/ui";
import { useMemo, useState } from "react";
import { DocSheet } from "./components/DocSheet";
import { ImageSheet } from "./components/ImageSheet";
import { LinkBrowserSheet } from "./components/LinkBrowserSheet";
import { resourceDetail } from "./resourceDetail";
import { resourceOpenAction } from "./resourceOpenAction";
import { resourceUrl } from "./resourceUrl";

export type ResourceListProps = {
	// The resources of the epic, in the order the server returns them.
	resources: readonly Resource[];
	count?: number;
	loading?: boolean;
	error?: string | null;
	header?: boolean;
	onAdd?: {
		doc: () => void;
		link: () => void;
		file: () => void;
	};
};

export function ResourceList({ resources, count, loading, error, header, onAdd }: ResourceListProps) {
	const [docId, setDocId] = useState<string | null>(null);
	const [linkId, setLinkId] = useState<string | null>(null);
	const [imageId, setImageId] = useState<string | null>(null);
	const doc = resources.find((resource) => resource.id === docId) ?? null;
	const link = resources.find((resource) => resource.id === linkId) ?? null;
	const image = resources.find((resource) => resource.id === imageId) ?? null;
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
		const opened = resources.find((resource) => resource.id === id)!;
		const desktop = (window as Window & { trellisDesktop?: unknown }).trellisDesktop !== undefined;
		switch (resourceOpenAction(opened, desktop)) {
			case "doc-sheet":
				setDocId(opened.id);
				return;
			case "link-sheet":
				setLinkId(opened.id);
				return;
			case "image-sheet":
				setImageId(opened.id);
				return;
			case "new-tab":
				window.open(resourceUrl(opened), "_blank", "noopener,noreferrer");
				return;
			case "download": {
				const anchor = document.createElement("a");
				anchor.href = resourceUrl(opened);
				anchor.download = opened.name;
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
				header={header}
				onOpen={onOpen}
				onAdd={onAdd}
			/>
			{doc !== null && <DocSheet key={doc.id} resource={doc} onClose={() => setDocId(null)} />}
			{link !== null && <LinkBrowserSheet name={link.name} url={link.url!} onClose={() => setLinkId(null)} />}
			{image !== null && <ImageSheet name={image.name} url={resourceUrl(image)} onClose={() => setImageId(null)} />}
		</>
	);
}
