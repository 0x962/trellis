import { type Harness, HarnessSchema } from "@trellis/api";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Draft = {
	project: string;
	name: string;
	prompt: string;
	harness: Harness;
	accountId: string;
	accountSelection: "automatic" | "manual";
	files: File[];
	requestId: string;
};
const empty = (): Draft => ({
	project: "",
	name: "",
	prompt: "",
	harness: HarnessSchema.parse({ preset: "claude" }),
	accountId: "",
	accountSelection: "automatic",
	files: [],
	requestId: crypto.randomUUID(),
});

export const useSessionComposerStore = create<Draft & { open: boolean }>()(
	persist((): Draft & { open: boolean } => ({ ...empty(), open: false }), {
		name: "trellis-session-composer",
		partialize: ({ project, name, prompt, harness, accountId, accountSelection, requestId }) => ({
			project,
			name,
			prompt,
			harness,
			accountId,
			accountSelection,
			requestId,
		}),
	}),
);

export const sessionComposerActions = {
	open: (project = "") =>
		useSessionComposerStore.setState({
			open: true,
			project,
			...(project === useSessionComposerStore.getState().project ? {} : { requestId: crypto.randomUUID() }),
		}),
	close: () => useSessionComposerStore.setState({ open: false }),
	change: (draft: Partial<Draft>) => useSessionComposerStore.setState({ ...draft, requestId: crypto.randomUUID() }),
	selectAccount: (accountId: string) => sessionComposerActions.change({ accountId, accountSelection: "manual" }),
	selectHarness: (harness: Harness) => {
		const changed = harness.preset !== useSessionComposerStore.getState().harness.preset;
		sessionComposerActions.change({
			harness,
			...(changed ? { accountId: "", accountSelection: "automatic" as const } : {}),
		});
	},
	automaticAccount: (accountId: string) => {
		const current = useSessionComposerStore.getState();
		if (current.accountSelection === "automatic" && current.accountId !== accountId)
			sessionComposerActions.change({ accountId });
	},
	clear: () =>
		useSessionComposerStore.setState({
			project: "",
			name: "",
			prompt: "",
			files: [],
			accountId: "",
			accountSelection: "automatic",
			requestId: crypto.randomUUID(),
			open: false,
		}),
};
