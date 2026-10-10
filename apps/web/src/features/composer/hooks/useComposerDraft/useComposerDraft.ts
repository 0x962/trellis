import type { Priority, TicketLabel } from "@trellis/api";
import { useCallback, useRef, useState } from "react";
import type { AssignChoice } from "../../../agents/AssignAgent/assignChoice";
import type { ComposerOptions } from "../../composerStore";

export type ComposerDraft = {
	title: string;
	description: string;
	project?: string;
	status?: string;
	priority?: Priority;
	parent?: string | null;
	epic?: string | null;
	wave?: string | null;
	labels?: TicketLabel[];
	assignment?: AssignChoice | null;
	editing?: boolean;
	automatic?: Array<"epic" | "wave" | "priority">;
};

export const draftKey = "trellis-composer-draft";

const empty: ComposerDraft = { title: "", description: "" };

const noContext: ComposerOptions = {};

const withContext = (draft: ComposerDraft, options: ComposerOptions): ComposerDraft => {
	if (options.epic === undefined) return draft;
	return {
		...draft,
		...(options.project === undefined ? {} : { project: options.project }),
		...(options.project !== undefined && draft.project !== options.project ? { parent: null, labels: [] } : {}),
		epic: options.epic,
		wave: options.wave ?? (draft.epic === options.epic ? draft.wave : undefined),
		automatic: draft.automatic?.filter((field) => field !== "epic" && (field !== "wave" || options.wave === undefined)),
	};
};

const read = (storageKey: string, initialDraft: ComposerDraft): ComposerDraft => {
	const stored = sessionStorage.getItem(storageKey);
	return stored === null ? initialDraft : (JSON.parse(stored) as ComposerDraft);
};

// The composer's text, kept in sessionStorage until a create or a discard.
// A closed dialog loses nothing; a reopened one reads the draft back.
export const useComposerDraft = (
	storageKey: string = draftKey,
	initialDraft: ComposerDraft = empty,
	options: ComposerOptions = noContext,
) => {
	const key = useRef(storageKey).current;
	const [draft, setState] = useState<ComposerDraft>(() => withContext(read(key, initialDraft), options));
	const [previousOptions, setPreviousOptions] = useState(options);
	const current = useRef(draft);
	const setDraft = useCallback(
		(change: ComposerDraft | ((draft: ComposerDraft) => ComposerDraft)) => {
			const next = typeof change === "function" ? change(current.current) : change;
			current.current = next;
			setState(next);
			sessionStorage.setItem(key, JSON.stringify(next));
		},
		[key],
	);
	const clearDraft = useCallback(() => {
		current.current = empty;
		setState(empty);
		sessionStorage.removeItem(key);
	}, [key]);
	if (previousOptions !== options) {
		setPreviousOptions(options);
		setDraft((current) => withContext(current, options));
	}
	return { draft, setDraft, clearDraft };
};
