import { Plus } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Resource } from "@trellis/api";
import { IconButton, SectionHeader, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { errorMessage } from "../../../../../lib/conflict";
import { PLAN_DOC_ID, planTitle } from "../../../epicDocs";
import { ResourceList } from "../../../ResourceList";
import { EpicDocument } from "./components/EpicDocument";

export type EpicResourcesProps = {
	// The canonical ref of the epic, `TRL/trellis-for-one-human-and-many-agents`.
	epic: string;
	// The description of the epic, as markdown.
	description: string;
	readOnly: boolean;
};

const noResources: readonly Resource[] = [];

// The Resources tab of the epic page: the list on the left and the open
// document on the right, as pages in Notion. The epic description is the
// first document of the list. It stays the `description` field of the epic,
// because the brief of every agent and `trellis epics show` print that field,
// so its edits save through `epics.update`. Every other document is a doc
// resource and saves through `resources.update`. Links, images and files sit
// in the same list with their kind word, and open in a sheet or download.
export function EpicResources({ epic, description, readOnly }: EpicResourcesProps) {
	const { client, orpc, queryClient } = useApp();
	const list = useQuery(orpc.resources.list.queryOptions({ input: { epic } }));
	const resources = list.data ?? noResources;
	const [openDocId, setOpenDocId] = useState(PLAN_DOC_ID);
	// A removed document opens the description again.
	const openDoc = resources.find((resource) => resource.id === openDocId && resource.kind === "doc") ?? null;
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
	const saveDoc = async (id: string, fields: { name: string } | { body: string }) => {
		await client.resources.update({ id, ...fields });
		await queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
	};

	return (
		<div className="flex min-h-0 flex-1 max-md:flex-col">
			<div className="flex w-80 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border px-3 py-3 max-md:max-h-1/3 max-md:w-full max-md:border-r-0 max-md:border-b">
				<SectionHeader
					title="Documents and files"
					level={3}
					className="px-2"
					actions={
						!readOnly && (
							<Tooltip content="New document">
								<IconButton
									label="New document"
									icon={<Plus />}
									disabled={create.isPending}
									onClick={() => create.mutate()}
								/>
							</Tooltip>
						)
					}
				/>
				{create.isError && (
					<p role="alert" className="px-2 text-sm text-danger">
						Could not create the document. {create.error.message}
					</p>
				)}
				<ResourceList
					resources={resources}
					planTitle={planTitle(description)}
					openDocId={openDoc?.id ?? PLAN_DOC_ID}
					onOpenDoc={setOpenDocId}
					loading={list.isPending}
					error={list.error === null ? null : errorMessage(list.error)}
					header={false}
				/>
			</div>
			<div className="min-w-0 flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
				<div className="mx-auto max-w-3xl">
					{openDoc === null ? (
						<EpicDocument
							key={PLAN_DOC_ID}
							docId={PLAN_DOC_ID}
							markdown={description}
							title={null}
							readOnly={readOnly}
							saveBody={saveDescription}
						/>
					) : (
						<EpicDocument
							key={openDoc.id}
							docId={openDoc.id}
							markdown={openDoc.body!}
							title={{ name: openDoc.name, save: (name) => saveDoc(openDoc.id, { name }) }}
							readOnly={readOnly}
							saveBody={(body) => saveDoc(openDoc.id, { body })}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
