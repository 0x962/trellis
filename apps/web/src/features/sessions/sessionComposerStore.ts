import { type Harness, HarnessSchema, type SessionDetail } from "@trellis/api";
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

type Options = { onCreated?: (session: SessionDetail) => void };
type ComposerState = Draft & { open: boolean; openingId: number; options: Options; stayOnPage: boolean };

export const useSessionComposerStore = create<ComposerState>()(
	persist((): ComposerState => ({ ...empty(), open: false, openingId: 0, options: {}, stayOnPage: false }), {
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
	open: (project = "", options: Options = {}) =>
		useSessionComposerStore.setState((state) => ({
			open: true,
			openingId: state.openingId + 1,
			options,
			stayOnPage: options.onCreated !== undefined,
			project,
			...(project === state.project ? {} : { requestId: crypto.randomUUID() }),
		})),
	close: () => useSessionComposerStore.setState({ open: false, options: {} }),
	created: (openingId: number, session: SessionDetail) => {
		const state = useSessionComposerStore.getState();
		if (!state.open || state.openingId !== openingId) return false;
		const onCreated = state.options.onCreated;
		sessionComposerActions.clear();
		onCreated?.(session);
		return !state.stayOnPage;
	},
	clearOnCreated: () => {
		useSessionComposerStore.setState({ options: {} });
	},
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
			options: {},
			stayOnPage: false,
		}),
};
