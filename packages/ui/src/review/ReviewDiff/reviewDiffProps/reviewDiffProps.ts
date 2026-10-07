import type { ReactNode } from "react";
import type { ThreadPlacement } from "../carryThreads";
import type { DiffFileGroup } from "../diffGroups";
import type { DiffAnchor, DiffThread, ReviewDiffFile } from "../ReviewDiff";

export type ReviewDiffProps = {
	active?: boolean;
	patch: string;
	revisionId: string;
	threads: DiffThread[];
	mode: "split" | "unified";
	theme: "light" | "dark" | "system";
	selectedFile?: string;
	selectedAnchor?: DiffAnchor | null;
	// A selected finding keeps this file open without changing its Viewed mark.
	revealedFile?: string;
	filter?: string;
	// `place` says where the diff draws the thread: on the line it names, on
	// the line its text moved to, or at the top of its file as outdated.
	renderThread: (id: string, place: ThreadPlacement) => ReactNode;
	composer?: DiffAnchor | null;
	renderComposer?: () => ReactNode;
	// `lines` is the text of the selected lines, for a suggestion, or null
	// when the view does not show every line of the range.
	onSelect: (anchor: DiffAnchor, lines: string[] | null) => void;
	loadFile?: (path: string, side: "old" | "new") => Promise<string>;
	onFiles: (files: ReviewDiffFile[]) => void;
	// The risk groups of the file tree. They set the order the diff draws its
	// files in, they give the band that stands above the first file of each
	// group, and they give the words that say why a file sits in its group. A
	// path no group names keeps its place in the patch, after every path a
	// group names. An empty list keeps the patch order and draws no band.
	groups?: readonly DiffFileGroup[];
	// A viewed file hides its lines unless revealedFile names it.
	viewed?: ReadonlySet<string>;
	// Marks a file read or unread. The header draws the Viewed box only when
	// the caller keeps this state.
	onViewed?: (path: string, viewed: boolean) => void;
};
