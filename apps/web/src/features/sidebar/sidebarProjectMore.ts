import { useProjectMoreStore } from "../../stores/projectMoreStore";

// True while the More row of this project shows the pages it holds.
// `morePathnameByProject` of the project More store states when a More row is
// open.
export const isMoreOpen = (morePathnameByProject: Record<string, string>, projectId: string, pathname: string) =>
	morePathnameByProject[projectId] === pathname;

// The open state of the More rows of one page. A list of projects calls this
// one time and asks the result for each project, because a hook cannot run
// inside the loop that draws the rows.
export const useProjectMore = (pathname: string) => {
	const morePathnameByProject = useProjectMoreStore((state) => state.morePathnameByProject);
	return (projectId: string) => isMoreOpen(morePathnameByProject, projectId, pathname);
};
