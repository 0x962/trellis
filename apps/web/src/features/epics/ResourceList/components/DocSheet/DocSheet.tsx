import { useMutation } from "@tanstack/react-query";
import type { Resource } from "@trellis/api";
import { useRef } from "react";
import { useApp } from "../../../../../lib/appContext";
import { PageSheet } from "../../../../shell/PageSheet";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar } from "../../../../shell/Topbar";
import { LazyEditor } from "../../../../ticket/Description/components/LazyEditor";

export type DocSheetProps = {
	resource: Resource;
	onClose: () => void;
};

export function DocSheet({ resource, onClose }: DocSheetProps) {
	const { client, orpc, queryClient } = useApp();
	const body = useRef(resource.body!);
	const savedBody = useRef(resource.body!);
	const save = useMutation({
		mutationFn: (nextBody: string) => client.resources.update({ id: resource.id, body: nextBody }),
		onSuccess: async (saved) => {
			savedBody.current = saved.body!;
			await queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
		},
	});
	return (
		<PageSheet open onClose={onClose} title={resource.name}>
			<Topbar>
				<PageTitle title={resource.name} />
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 max-md:px-4">
				<LazyEditor
					markdown={resource.body!}
					contentKey={resource.id}
					onChange={(markdown) => {
						body.current = markdown;
					}}
					onBlur={() => {
						if (body.current !== savedBody.current) save.mutate(body.current);
					}}
					onReady={() => {}}
					onAttachFiles={() => {}}
				/>
				{save.isError && (
					<p role="alert" className="mt-3 text-sm text-danger">
						Could not save the document. {save.error.message}
					</p>
				)}
			</div>
		</PageSheet>
	);
}
