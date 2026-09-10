import { useCallback, useState } from "react";

export type ComposerDraft = { title: string; description: string };

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
	const setDraft = useCallback((next: ComposerDraft) => {
		setState(next);
		sessionStorage.setItem(draftKey, JSON.stringify(next));
	}, []);
	const clearDraft = useCallback(() => {
		setState(empty);
		sessionStorage.removeItem(draftKey);
	}, []);
	return { draft, setDraft, clearDraft };
};
