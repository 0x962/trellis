import { create } from "zustand";
import { persist } from "zustand/middleware";

type Draft = { text: string; files: File[]; messageId: string };

export const useSessionMessageStore = create<Record<string, Draft>>()(
	persist((): Record<string, Draft> => ({}), {
		name: "trellis-session-messages",
		partialize: (drafts) =>
			Object.fromEntries(Object.entries(drafts).map(([id, draft]) => [id, { ...draft, files: [] }])),
	}),
);

export function changeSessionMessage(runId: string, changes: Partial<Pick<Draft, "text" | "files">> = {}) {
	const previous = useSessionMessageStore.getState()[runId];
	useSessionMessageStore.setState({
		[runId]: { text: previous?.text ?? "", files: previous?.files ?? [], ...changes, messageId: crypto.randomUUID() },
	});
}
