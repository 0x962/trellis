import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Resource, UlidSchema } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { errorMessage } from "../../../../../lib/conflict";
import { PLAN_DOC_ID, planTitle } from "../../../epicDocs";
import { ResourceList } from "../../../ResourceList";
import { CommentedDocument } from "./components/CommentedDocument";
import { EpicDocument } from "./components/EpicDocument";

export type EpicResourcesProps = {
	// The canonical ref of the epic, `TRL/trellis-for-one-human-and-many-agents`.
	epic: string;
	// The description of the epic, as markdown.
	description: string;
	readOnly: boolean;
	// The resource ID in the route hash, when an internal link names one.
	resourceId?: string;
};

const noResources: readonly Resource[] = [];

// The Resources tab of the epic page: the list on the left and the open
// document on the right, as pages in Notion. The epic description is the
// first document of the list. It stays the `description` field of the epic,
// because the brief of every agent and `trellis epics show` print that field,
// so its edits save through `epics.update`. Every other document is a doc
// resource and saves through `resources.update`. Links, images and files sit
// in the same list under their own headings, and open in a sheet or download.
// A document resource takes comments on its text; the description does not.
export function EpicResources({ epic, description, readOnly, resourceId }: EpicResourcesProps) {
	const { client, orpc, queryClient } = useApp();
	const [page, setPage] = useState({ epic, offset: 0 });
	const offset = page.epic === epic ? page.offset : 0;
	const list = useQuery(orpc.resources.list.queryOptions({ input: { epic, limit: 51, offset } }));
	const resources = useMemo(() => list.data?.slice(0, 50) ?? noResources, [list.data]);
	const [openDocId, setOpenDocId] = useState(() => UlidSchema.safeParse(resourceId).data ?? PLAN_DOC_ID);
	useEffect(() => {
		const linked = UlidSchema.safeParse(resourceId);
		if (linked.success) setOpenDocId(linked.data);
	}, [resourceId]);
	const target = useQuery(
		orpc.resources.get.queryOptions({
			input: { id: openDocId },
			enabled: openDocId !== PLAN_DOC_ID,
		}),
	);
	const openDoc = target.data?.kind === "doc" ? target.data : null;
	const create = useMutation({
		mutationFn: () => client.resources.add({ epic, kind: "doc", name: "", body: "" }),
		onSuccess: async (created) => {
			await queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
			await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
			setOpenDocId(created.id);
		},
	});
	const saveDescription = async (markdown: string) => {
		await client.epics.update({ epic, description: markdown });
		await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
	};
	const uploadFile = async (kind: "image" | "file", file: File) => {
		const created = await client.resources.add({ epic, kind, name: file.name, file });
		await queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
		await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
		return created;
	};
	const saveDoc = async (id: string, fields: { name: string } | { body: string }) => {
		await client.resources.update({ id, ...fields });
		await queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
	};

	return (
		<div className="flex min-h-0 flex-1 max-md:flex-col">
			<div className="flex w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border px-2 py-3 max-md:max-h-1/3 max-md:w-full max-md:border-r-0 max-md:border-b">
				<ResourceList
					resources={resources}
					planTitle={planTitle(description)}
					openDocId={openDocId}
					linkedResourceId={resourceId}
					linkedResource={target.data}
					onOpenDoc={setOpenDocId}
					loading={list.isPending}
					error={list.error === null ? null : errorMessage(list.error)}
					onNewDocument={readOnly ? undefined : () => create.mutate()}
					newDocumentPending={create.isPending}
				/>
				{(offset > 0 || (list.data?.length ?? 0) > 50) && (
					<div className="flex items-center justify-between py-2">
						<Tooltip content="Previous resources">
							<IconButton
								label="Previous resources"
								icon={<ArrowLeft />}
								disabled={offset === 0 || list.isPending}
								onClick={() => setPage({ epic, offset: offset - 50 })}
							/>
						</Tooltip>
						<span className="text-xs text-fg-muted tabular-nums">Page {offset / 50 + 1}</span>
						<Tooltip content="Next resources">
							<IconButton
								label="Next resources"
								icon={<ArrowRight />}
								disabled={(list.data?.length ?? 0) <= 50 || list.isPending}
								onClick={() => setPage({ epic, offset: offset + 50 })}
							/>
						</Tooltip>
					</div>
				)}
				{target.isError && (
					<p role="alert" className="px-2 text-sm text-danger">
						{errorMessage(target.error)}
					</p>
				)}
				{create.isError && (
					<p role="alert" className="px-2 text-sm text-danger">
						Could not create the document. {create.error.message}
					</p>
				)}
			</div>
			{openDoc === null ? (
				<EpicDocument
					key={PLAN_DOC_ID}
					docId={PLAN_DOC_ID}
					markdown={description}
					title={null}
					readOnly={readOnly}
					saveBody={saveDescription}
					uploadFile={uploadFile}
				/>
			) : (
				<CommentedDocument
					key={openDoc.id}
					resourceId={openDoc.id}
					docId={openDoc.id}
					markdown={openDoc.body!}
					title={{ name: openDoc.name, save: (name) => saveDoc(openDoc.id, { name }) }}
					readOnly={readOnly}
					saveBody={(body) => saveDoc(openDoc.id, { body })}
					uploadFile={uploadFile}
				/>
			)}
		</div>
	);
}
