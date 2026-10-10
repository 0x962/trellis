import type { Priority, TicketLabel } from "@trellis/api";
import { useCallback, useRef, useState } from "react";
import type { AssignChoice } from "../../../agents/AssignAgent/assignChoice";

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

const read = (storageKey: string, initialDraft: ComposerDraft): ComposerDraft => {
	const stored = sessionStorage.getItem(storageKey);
	return stored === null ? initialDraft : (JSON.parse(stored) as ComposerDraft);
};

// The composer's text, kept in sessionStorage until a create or a discard.
// A closed dialog loses nothing; a reopened one reads the draft back.
export const useComposerDraft = (storageKey: string = draftKey, initialDraft: ComposerDraft = empty) => {
	const key = useRef(storageKey).current;
	const [draft, setState] = useState<ComposerDraft>(() => read(key, initialDraft));
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
	return { draft, setDraft, clearDraft };
};
