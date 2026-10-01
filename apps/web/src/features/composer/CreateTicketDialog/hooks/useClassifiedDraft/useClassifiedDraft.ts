import { effortForHarness, type Priority } from "@trellis/api";
import type { AssignChoice } from "../../../../agents/AssignAgent/assignChoice";
import type { ComposerOptions } from "../../../composerStore";
import type { ComposerDraft } from "../../../hooks/useComposerDraft/useComposerDraft";
import { useTicketClassification } from "../useTicketClassification";

type Fields = Pick<ComposerDraft, "epic" | "wave" | "priority" | "assignment">;
const fields = ["epic", "wave", "priority"] as const;
const pins = (draft: ComposerDraft, options: ComposerOptions, defaultPriority: Priority) => {
	const automatic = draft.automatic ?? [];
	return {
		epic: automatic.includes("epic") ? undefined : draft.epic === undefined ? options.epic : (draft.epic ?? undefined),
		wave: automatic.includes("wave") ? undefined : draft.wave === undefined ? options.wave : (draft.wave ?? undefined),
		priority:
			!automatic.includes("priority") &&
			(draft.priority !== undefined || options.priority !== undefined || defaultPriority !== "none"),
		assignment: draft.assignment !== undefined && !automatic.includes("assignment"),
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
	defaultAssignment,
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
	defaultAssignment: AssignChoice;
	disabled: boolean;
	isSubmitting: () => boolean;
}) {
	const fixed = pins(draft, options, defaultPriority);
	const choice = draft.assignment === undefined ? defaultAssignment : draft.assignment;
	const state = useTicketClassification({
		project,
		title: draft.title,
		description,
		epic: fixed.epic,
		wave: fixed.wave,
		harness: fixed.assignment ? undefined : choice?.preset,
		disabled: disabled || (fixed.wave !== undefined && fixed.priority && fixed.assignment),
		onResult: (result, request) => {
			if (isSubmitting()) return;
			setDraft((current) => {
				const currentDescription = current.editing || current.description !== "" ? current.description : template;
				const selected = pins(current, options, defaultPriority);
				const assignment = current.assignment === undefined ? defaultAssignment : current.assignment;
				if (
					(current.project ?? project) !== request.project ||
					current.title.trim() !== request.title ||
					currentDescription !== request.description ||
					selected.epic !== request.epic ||
					selected.wave !== request.wave ||
					(selected.assignment ? undefined : assignment?.preset) !== request.harness
				)
					return current;
				const automatic = fields.filter((field) => !selected[field]);
				const next: ComposerDraft = {
					...current,
					...Object.fromEntries(automatic.map((field) => [field, result[field]])),
					automatic,
				};
				if (!selected.assignment && assignment && result.model !== null) {
					const effort = effortForHarness(assignment.preset, result.model);
					next.assignment = {
						...assignment,
						model: result.model,
						effort: effort?.options.some(({ value }) => value === assignment.effort) ? assignment.effort : null,
					};
					next.automatic = [...automatic, "assignment"];
				}
				return next;
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
		state === "error" ? "Automatic selection is unavailable. Select the ticket fields and agent model." : null;
	return { choose, message };
}
