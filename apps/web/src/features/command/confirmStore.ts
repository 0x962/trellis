import { create } from "zustand";

export type ConfirmState = {
	// The question the palette asks before it deletes, such as "Delete CDE-42?"
	// or "Delete 3 tickets?". It stays after the answer, so the dialog keeps
	// its title through the frames of its closing transition.
	question: string;
	// True while an action waits for the answer.
	open: boolean;
};

export const useConfirmStore = create<ConfirmState>()(() => ({ question: "", open: false }));

// The `resolve` of the promise `askConfirm` returned. `answer` calls it, so
// the action that waits on the promise runs on or stops.
let pending: ((confirmed: boolean) => void) | null = null;

// Asks the question and waits for the person. The palette host draws the
// dialog for the question this sets.
export const askConfirm = (question: string): Promise<boolean> =>
	new Promise((resolve) => {
		pending = resolve;
		useConfirmStore.setState({ question, open: true });
	});

export const confirmActions = {
	// The dialog takes an answer only while a question waits, so `pending`
	// holds the resolve of that question.
	answer: (confirmed: boolean) => {
		const resolve = pending!;
		pending = null;
		useConfirmStore.setState({ open: false });
		resolve(confirmed);
	},
};
