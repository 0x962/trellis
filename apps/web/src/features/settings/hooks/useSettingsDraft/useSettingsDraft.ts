import { useQuery } from "@tanstack/react-query";
import type { Settings } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useApp } from "../../../../lib/appContext";

// The edits the page holds before a save, by field name. `settings.set`
// replaces the whole record, so one save carries every field the page shows,
// edited or not. The draft lives beside the saved settings and never
// overwrites them, so a rejected save leaves each field on its saved value.
const draftKey = ["settings", "draft"];

const emptyDraft: Partial<Settings> = {};

export const useSettingsDraft = () => {
	const { client, orpc, queryClient } = useApp();
	const savedKey = orpc.settings.get.queryKey({});
	const saved = useQuery(orpc.settings.get.queryOptions({})).data;
	const draft = useQuery({
		queryKey: draftKey,
		queryFn: () => emptyDraft,
		initialData: emptyDraft,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
	}).data;

	const edit = (patch: Partial<Settings>) =>
		queryClient.setQueryData(draftKey, (current: Partial<Settings> | undefined) => ({ ...current, ...patch }));

	// Writes the saved record with the draft and `patch` on top. Returns the
	// stored settings, or undefined when the server refused the write.
	const save = async (patch: Partial<Settings>) => {
		try {
			const stored = await client.settings.set({ ...saved!, ...draft, ...patch });
			queryClient.setQueryData(savedKey, stored);
			queryClient.setQueryData(draftKey, emptyDraft);
			toast.success("Settings saved");
			return stored;
		} catch (error) {
			queryClient.setQueryData(draftKey, emptyDraft);
			toast.error("Couldn't save the settings", {
				description: (error as Error).message,
				action: { label: "Retry", onClick: () => void save(patch) },
			});
			return undefined;
		}
	};

	return { saved, draft, edit, save };
};
