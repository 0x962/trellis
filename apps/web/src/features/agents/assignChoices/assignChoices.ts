import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type AssignChoice, choiceKey } from "../assignChoice";

// The choices the Assign menu offers. Five rows fit under the split control
// without a scroll, and each row carries the number key of its place.
export const RECENT_CHOICE_LIMIT = 5;

type RecentChoices = { recent: AssignChoice[] };

// The last five choices that started an agent, newest first. A repeated
// choice moves to the top and never becomes a second entry.
export const recentWith = (recent: readonly AssignChoice[], choice: AssignChoice): AssignChoice[] => {
	const key = choiceKey(choice);
	return [choice, ...recent.filter((entry) => choiceKey(entry) !== key)].slice(0, RECENT_CHOICE_LIMIT);
};

// The list lives in the local storage of the browser profile, so it survives
// a reload of the page.
export const useAssignChoices = create<RecentChoices>()(
	persist((): RecentChoices => ({ recent: [] }), { name: "trellis-assign-choices" }),
);

export const assignChoiceActions = {
	// Called after a start succeeds. A choice that failed stays out of the
	// list, so the menu offers only choices that ran.
	remember: (choice: AssignChoice) =>
		useAssignChoices.setState(({ recent }) => ({ recent: recentWith(recent, choice) })),
};
