import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type AssignChoice, keyOf } from "../assignChoice";

// Five rows fit under the split control without a scroll, and each row can
// carry one number key.
export const RECENT_CHOICE_LIMIT = 5;

type RecentChoices = { recent: AssignChoice[] };

// The stored choices with `choice` at the front. A repeated choice moves to
// the front and never becomes a second entry.
export const recentWith = (recent: readonly AssignChoice[], choice: AssignChoice): AssignChoice[] => {
	const key = keyOf(choice);
	return [choice, ...recent.filter((entry) => keyOf(entry) !== key)].slice(0, RECENT_CHOICE_LIMIT);
};

// The list lives in the local storage of the browser profile, so it survives
// a reload of the page.
export const useRecentChoices = create<RecentChoices>()(
	persist((): RecentChoices => ({ recent: [] }), { name: "trellis-recent-choices" }),
);

// A choice that failed stays out of the list, so the menu offers only choices
// that ran.
export const rememberChoice = (choice: AssignChoice) =>
	useRecentChoices.setState(({ recent }) => ({ recent: recentWith(recent, choice) }));
