import type { Resource } from "@trellis/api";
import { type ResourceListRow, ResourceList as ResourceListView } from "@trellis/ui";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { isDesktopApp } from "../../../lib/desktopBridge";
import { type LinkModifiers, useOpenLink } from "../../../lib/openLink";
import { docTitle, PLAN_DOC_ID } from "../epicDocs";
import { ImageSheet } from "./components/ImageSheet";
import { createLinkedResourceOpener } from "./createLinkedResourceOpener";
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
	linkedResourceId?: string;
	linkedResource?: Resource;
	// Opens a document beside the list: `PLAN_DOC_ID` or a resource id.
	onOpenDoc: (id: string) => void;
	loading: boolean;
	error: string | null;
	// Absent on a page that takes no write.
	onNewDocument?: () => void;
	newDocumentPending: boolean;
};

// A document opens beside the list. A link opens in the in-app browser, an
// image opens full size, and a file downloads.
export function ResourceList({
	resources,
	planTitle,
	openDocId,
	linkedResourceId,
	linkedResource,
	onOpenDoc,
	loading,
	error,
	onNewDocument,
	newDocumentPending,
}: ResourceListProps) {
	const openLink = useOpenLink();
	const [image, setImage] = useState<Resource | null>(null);
	const byId = useMemo(() => new Map(resources.map((resource) => [resource.id, resource])), [resources]);
	const rows = useMemo<ResourceListRow[]>(
		() => [
			{ id: PLAN_DOC_ID, kind: "doc", name: planTitle, detail: "The epic description", pullRequest: null, plan: true },
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
	const open = (opened: Resource, modifiers?: LinkModifiers) => {
		const desktop = isDesktopApp();
		switch (resourceOpenAction(opened, desktop)) {
			case "doc":
				onOpenDoc(opened.id);
				return;
			case "link-sheet":
				openLink(resourceUrl(opened), modifiers);
				return;
			case "image-sheet":
				setImage(opened);
				return;
			case "new-tab":
				if (opened.kind === "link") {
					openLink(resourceUrl(opened), modifiers);
					return;
				}
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
	const onOpen = (id: string, event: LinkModifiers) => {
		if (id === PLAN_DOC_ID) onOpenDoc(id);
		else open(byId.get(id)!, event);
	};
	const openResource = useEffectEvent(open);
	const [openLinkedResource] = useState(createLinkedResourceOpener);
	useEffect(() => {
		openLinkedResource(linkedResourceId, linkedResource, openResource);
	}, [linkedResourceId, linkedResource, openLinkedResource]);
	return (
		<>
			<ResourceListView
				rows={rows}
				loading={loading}
				error={error}
				onOpen={onOpen}
				selectedId={openDocId}
				onNewDocument={onNewDocument}
				newDocumentPending={newDocumentPending}
			/>
			{image !== null && <ImageSheet name={image.name} url={resourceUrl(image)} onClose={() => setImage(null)} />}
		</>
	);
}
