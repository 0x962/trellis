import { ORPCError } from "@orpc/client";
import { useMutation } from "@tanstack/react-query";
import { type PageDetail as PageRecord, type PageSummary, PageTitleSchema } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useApp } from "../../../../lib/appContext";

const pageActionError = (error: Error) => {
	if (error instanceof ORPCError && error.code === "PAGE_VERSION_CONFLICT") {
		const page = (error.data as { current: PageSummary }).current;
		return `Revision ${page.revision}, version ${page.latestVersion}. ${page.actor.displayName ?? page.actor.name} changed this Page. Published ${new Date(page.publishedAt).toLocaleString()}.`;
	}
	return error.message;
};

export const usePageActions = (page: PageRecord, offline: boolean, archived: boolean) => {
	const { client, orpc, queryClient } = useApp();
	const invalidate = () => queryClient.invalidateQueries({ queryKey: orpc.pages.key() });
	const mutation = useMutation({
		mutationFn: async (action: "pin" | "delete" | "restore" | "download") => {
			if (offline) throw new Error("The server is offline.");
			if (archived && action !== "download") throw new Error("The project is archived.");
			if (action === "pin") await client.pages.pin({ page: page.ref, pinned: !page.pinned });
			if (action === "delete") await client.pages.delete({ page: page.ref, expectedVersion: page.revision });
			if (action === "restore") await client.pages.restore({ page: page.ref, expectedVersion: page.revision });
			if (action === "download") {
				const archive = await client.pages.archive({ page: page.ref, version: page.requestedVersion.number });
				const link = document.createElement("a");
				link.href = archive.url;
				link.download = `${page.slug}-v${page.requestedVersion.number}.zip`;
				link.referrerPolicy = "no-referrer";
				link.click();
			}
		},
		onSuccess: async (_data, action) => {
			await invalidate();
			toast.success(action === "download" ? "Page download started" : "Page updated");
		},
		onError: async (error) => {
			toast.error("The Page action failed", { description: pageActionError(error) });
			await invalidate();
		},
	});
	const rename = async (title: string) => {
		if (offline) throw new Error("The server is offline.");
		if (archived) throw new Error("The project is archived.");
		const parsed = PageTitleSchema.safeParse(title);
		if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
		try {
			await client.pages.update({ page: page.ref, title: parsed.data, expectedVersion: page.revision });
			await invalidate();
		} catch (error) {
			await invalidate();
			throw new Error(pageActionError(error as Error));
		}
	};
	return { mutation, rename };
};
