import type { Priority } from "@trellis/api";
import type { ComposerOptions } from "../../../composerStore";
import type { ComposerDraft } from "../../../hooks/useComposerDraft/useComposerDraft";
import { useTicketClassification } from "../useTicketClassification";

type Fields = Pick<ComposerDraft, "epic" | "wave" | "priority">;
const fields = ["epic", "wave", "priority"] as const;
const pins = (draft: ComposerDraft, options: ComposerOptions, defaultPriority: Priority) => {
	const automatic = draft.automatic ?? [];
	return {
		epic: automatic.includes("epic") ? undefined : draft.epic === undefined ? options.epic : (draft.epic ?? undefined),
		wave: automatic.includes("wave") ? undefined : draft.wave === undefined ? options.wave : (draft.wave ?? undefined),
		priority:
			!automatic.includes("priority") &&
			(draft.priority !== undefined || options.priority !== undefined || defaultPriority !== "none"),
	};
};

export function useClassifiedDraft({
	draft,
	setDraft,
	options,
	project,
	description,
	template,
	defaultPriority,
	disabled,
	isSubmitting,
}: {
	draft: ComposerDraft;
	setDraft: (change: ComposerDraft | ((current: ComposerDraft) => ComposerDraft)) => void;
	options: ComposerOptions;
	project: string | undefined;
	description: string;
	template: string;
	defaultPriority: Priority;
	disabled: boolean;
	isSubmitting: () => boolean;
}) {
	const fixed = pins(draft, options, defaultPriority);
	const state = useTicketClassification({
		project,
		title: draft.title,
		description,
		epic: fixed.epic,
		wave: fixed.wave,
		disabled: disabled || (fixed.wave !== undefined && fixed.priority),
		onResult: (result, request) => {
			if (isSubmitting()) return;
			setDraft((current) => {
				const currentDescription = current.editing || current.description !== "" ? current.description : template;
				const selected = pins(current, options, defaultPriority);
				if (
					(current.project ?? project) !== request.project ||
					current.title.trim() !== request.title ||
					currentDescription !== request.description ||
					selected.epic !== request.epic ||
					selected.wave !== request.wave
				)
					return current;
				const automatic = fields.filter((field) => !selected[field]);
				return { ...current, ...Object.fromEntries(automatic.map((field) => [field, result[field]])), automatic };
			});
		},
	});
	const choose = (change: Partial<Fields>) =>
		setDraft((current) => ({
			...current,
			...change,
			automatic: current.automatic?.filter((field) => !Object.hasOwn(change, field)),
		}));
	const message =
		state === "pending"
			? "Selecting epic, wave, and priority…"
			: state === "error"
				? "Automatic selection is unavailable. Select an epic, wave, and priority."
				: null;
	return { choose, message };
}
