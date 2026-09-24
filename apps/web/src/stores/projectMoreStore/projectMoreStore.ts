import { create } from "zustand";

export type ProjectMoreState = {
	// The pathname that each open More row was opened on, by project id. A
	// project with no entry holds More shut. Two rules shut the row when the
	// person leaves the page. `isMoreOpen` compares this pathname with the
	// pathname on screen, which shuts the row at once, before any effect runs.
	// `setShownPathname` then empties this record, which shuts a return to the
	// pathname of the press.
	morePathnameByProject: Record<string, string>;
	// The pathname that the sidebar draws now. `setShownPathname` compares it
	// with the pathname the sidebar reports.
	shownPathname: string;
	// `pathname` is the page on screen at the press.
	toggleProjectMore: (id: string, pathname: string) => void;
	setShownPathname: (pathname: string) => void;
};

const updates = {
	toggleProjectMore:
		(id: string, pathname: string) =>
		(state: ProjectMoreState): Partial<ProjectMoreState> => {
			const paths = { ...state.morePathnameByProject };
			if (paths[id] === pathname) delete paths[id];
			else paths[id] = pathname;
			return { morePathnameByProject: paths };
		},
	setShownPathname:
		(pathname: string) =>
		(state: ProjectMoreState): Partial<ProjectMoreState> => {
			if (state.shownPathname === pathname) return {};
			// Both lists of projects select `morePathnameByProject`, so a new
			// empty record renders each of them again for no change on screen.
			if (Object.keys(state.morePathnameByProject).length === 0) return { shownPathname: pathname };
			return { shownPathname: pathname, morePathnameByProject: {} };
		},
};

// The open More rows of the sidebar. Nothing writes these values to browser
// storage, so a reload opens every project with More shut. They live outside
// `useUiStore` because the persist middleware of that store writes its whole
// stored payload on each change, and the sidebar reports its pathname on every
// navigation of the app.
export const createProjectMoreStore = () =>
	create<ProjectMoreState>()((set) => ({
		morePathnameByProject: {},
		shownPathname: "",
		toggleProjectMore: (id, pathname) => set(updates.toggleProjectMore(id, pathname)),
		setShownPathname: (pathname) => set(updates.setShownPathname(pathname)),
	}));

export const useProjectMoreStore = createProjectMoreStore();

// The actions components call. Each one changes `useProjectMoreStore` itself.
export const projectMoreActions = {
	toggleProjectMore: (id: string, pathname: string) =>
		useProjectMoreStore.setState(updates.toggleProjectMore(id, pathname)),
	setShownPathname: (pathname: string) => useProjectMoreStore.setState(updates.setShownPathname(pathname)),
};
