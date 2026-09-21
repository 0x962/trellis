import type { Resource } from "@trellis/api";
import { type ResourceListRow, ResourceList as ResourceListView } from "@trellis/ui";
import { useMemo, useState } from "react";
import { docTitle, PLAN_DOC_ID } from "../epicDocs";
import { ImageSheet } from "./components/ImageSheet";
import { LinkBrowserSheet } from "./components/LinkBrowserSheet";
import { resourceDetail } from "./resourceDetail";
import { resourceOpenAction } from "./resourceOpenAction";
import { resourceUrl } from "./resourceUrl";

export type ResourceListProps = {
	// The resources of the epic, in the order the server returns them.
	resources: readonly Resource[];
	// The title of the epic description. The list draws the description as its
	// first document, with the id `PLAN_DOC_ID`.
	planTitle: string;
	// The id of the document open beside the list.
	openDocId: string;
	// Opens a document beside the list: `PLAN_DOC_ID` or a resource id.
	onOpenDoc: (id: string) => void;
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

// A document opens beside the list. A link opens in the in-app browser, an
// image opens full size, and a file downloads.
export function ResourceList({
	resources,
	planTitle,
	openDocId,
	onOpenDoc,
	count,
	loading,
	error,
	header,
	onAdd,
}: ResourceListProps) {
	const [linkId, setLinkId] = useState<string | null>(null);
	const [imageId, setImageId] = useState<string | null>(null);
	const link = resources.find((resource) => resource.id === linkId) ?? null;
	const image = resources.find((resource) => resource.id === imageId) ?? null;
	const rows = useMemo<ResourceListRow[]>(
		() => [
			{ id: PLAN_DOC_ID, kind: "doc", name: planTitle, detail: "the epic description", pullRequest: null },
			...resources.map((resource) => ({
				id: resource.id,
				kind: resource.kind,
				name: resource.kind === "doc" ? docTitle(resource.name) : resource.name,
				detail: resourceDetail(resource),
				pullRequest: resource.pullRequestNumber,
			})),
		],
		[resources, planTitle],
	);
	const onOpen = (id: string) => {
		if (id === PLAN_DOC_ID) {
			onOpenDoc(id);
			return;
		}
		const opened = resources.find((resource) => resource.id === id)!;
		const desktop = (window as Window & { trellisDesktop?: unknown }).trellisDesktop !== undefined;
		switch (resourceOpenAction(opened, desktop)) {
			case "doc":
				onOpenDoc(opened.id);
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
				selectedId={openDocId}
				onAdd={onAdd}
			/>
			{link !== null && <LinkBrowserSheet name={link.name} url={link.url!} onClose={() => setLinkId(null)} />}
			{image !== null && <ImageSheet name={image.name} url={resourceUrl(image)} onClose={() => setImageId(null)} />}
		</>
	);
}
