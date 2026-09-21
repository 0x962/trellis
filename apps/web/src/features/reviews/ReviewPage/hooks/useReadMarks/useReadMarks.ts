import { useCallback, useMemo, useState } from "react";
import { isRead, loadReadMarks, type ReadMarkFile, saveReadMarks, setReadMark } from "../../../readMarks/readMarks";

export type ReadMarksState = {
	// The paths of the files the person marked read in this revision.
	read: ReadonlySet<string>;
	setRead: (path: string, read: boolean) => void;
};

// The read marks of one pull request, held in `localStorage`. A mark records
// the shape the file had at the mark, so a commit that changes the file drops
// the mark and the person reads the file again.
//
// The file tree dims a read file and the diff shows its header alone, so the
// review page owns this state and hands it to both panes.
export function useReadMarks(pr: string, files: ReadMarkFile[]): ReadMarksState {
	const [marks, setMarks] = useState(() => loadReadMarks(localStorage, pr));
	// `marks` holds the entry of one pull request. `markedPr` names it. When the
	// caller passes another pull request, the render below reads that entry
	// before it draws, so a mark of the previous pull request never reaches the
	// new entry.
	const [markedPr, setMarkedPr] = useState(pr);
	if (markedPr !== pr) {
		setMarkedPr(pr);
		setMarks(loadReadMarks(localStorage, pr));
	}
	const read = useMemo(
		() => new Set(files.filter((file) => isRead(marks, file)).map((file) => file.path)),
		[files, marks],
	);
	const setRead = useCallback(
		(path: string, next: boolean) => {
			const file = files.find((entry) => entry.path === path)!;
			const after = setReadMark(marks, file, next);
			saveReadMarks(localStorage, pr, after);
			setMarks(after);
		},
		[files, marks, pr],
	);
	return { read, setRead };
}
