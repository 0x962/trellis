import { useQuery } from "@tanstack/react-query";
import type { PageCommentAnchor } from "@trellis/api";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";

export function usePageComments(page: string) {
	const { client, orpc, queryClient } = useApp();
	const [status, setStatus] = useState("");
	const query = useQuery(orpc.pages.comments.queryOptions({ input: { page } }));
	const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.pages.key() });
	return {
		threads: query.data ?? [],
		pending: query.isPending,
		error: query.error,
		status,
		create: async (version: number, anchor: PageCommentAnchor, body: string) => {
			setStatus("");
			const thread = await client.pages.comment({ page, version, anchor, body });
			await refresh();
			setStatus("Comment added");
			return thread;
		},
		reply: async (thread: string, body: string) => {
			setStatus("");
			await client.pages.commentReply({ thread, body });
			await refresh();
			setStatus("Reply added");
		},
		resolve: async (thread: string, resolved: boolean) => {
			setStatus("");
			await client.pages.commentResolve({ thread, resolved });
			await refresh();
			setStatus(resolved ? "Comment resolved" : "Comment reopened");
		},
		edit: async (id: string, body: string) => {
			setStatus("");
			await client.pages.commentEdit({ id, body });
			await refresh();
			setStatus("Comment saved");
		},
		deleteComment: async (id: string) => {
			setStatus("");
			await client.pages.commentDelete({ id });
			await refresh();
			setStatus("Comment deleted");
		},
	};
}
