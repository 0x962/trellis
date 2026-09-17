import { create } from "zustand";

type Draft = { files: File[]; messageId: string };

export const useSessionMessageStore = create<Record<string, Draft>>(() => ({}));

export function changeSessionMessage(runId: string, files?: File[]) {
	const previous = useSessionMessageStore.getState()[runId];
	useSessionMessageStore.setState({
		[runId]: { files: files ?? previous?.files ?? [], messageId: crypto.randomUUID() },
	});
}
