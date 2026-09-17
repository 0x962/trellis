import { type Harness, HarnessSchema } from "@trellis/api";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Draft = {
	project: string;
	name: string;
	prompt: string;
	harness: Harness;
	accountId: string;
	files: File[];
	requestId: string;
};
const empty = (): Draft => ({
	project: "",
	name: "",
	prompt: "",
	harness: HarnessSchema.parse({ preset: "claude" }),
	accountId: "",
	files: [],
	requestId: crypto.randomUUID(),
});

export const useSessionComposerStore = create<Draft & { open: boolean }>()(
	persist((): Draft & { open: boolean } => ({ ...empty(), open: false }), {
		name: "trellis-session-composer",
		partialize: ({ project, name, prompt, harness, accountId, requestId }) => ({
			project,
			name,
			prompt,
			harness,
			accountId,
			requestId,
		}),
	}),
);

export const sessionComposerActions = {
	open: (project?: string) =>
		useSessionComposerStore.setState({
			open: true,
			...(project === undefined || project === useSessionComposerStore.getState().project
				? {}
				: { project, requestId: crypto.randomUUID() }),
		}),
	close: () => useSessionComposerStore.setState({ open: false }),
	change: (draft: Partial<Draft>) => useSessionComposerStore.setState({ ...draft, requestId: crypto.randomUUID() }),
	clear: () =>
		useSessionComposerStore.setState({ name: "", prompt: "", files: [], requestId: crypto.randomUUID(), open: false }),
};
