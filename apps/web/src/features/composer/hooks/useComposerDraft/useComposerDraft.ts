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
	createMore?: boolean;
	editing?: boolean;
	automatic?: Array<"epic" | "wave" | "priority">;
};

export const draftKey = "trellis-composer-draft";

const empty: ComposerDraft = { title: "", description: "" };

const read = (): ComposerDraft => {
	const stored = sessionStorage.getItem(draftKey);
	return stored === null ? empty : (JSON.parse(stored) as ComposerDraft);
};

// The composer's text, kept in sessionStorage until a create or a discard.
// A closed dialog loses nothing; a reopened one reads the draft back.
export const useComposerDraft = () => {
	const [draft, setState] = useState<ComposerDraft>(read);
	const current = useRef(draft);
	const setDraft = useCallback((change: ComposerDraft | ((draft: ComposerDraft) => ComposerDraft)) => {
		const next = typeof change === "function" ? change(current.current) : change;
		current.current = next;
		setState(next);
		sessionStorage.setItem(draftKey, JSON.stringify(next));
	}, []);
	const clearDraft = useCallback(() => {
		current.current = empty;
		setState(empty);
		sessionStorage.removeItem(draftKey);
	}, []);
	return { draft, setDraft, clearDraft };
};
