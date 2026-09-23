// One group of the file tree, as the diff reads it. `FileRiskGroup` of
// `FileRiskGroups` has this shape and more, so both panes name the same groups
// and draw their files in one order.
export type DiffFileGroup = {
	key: string;
	label: string;
	files: readonly { path: string; reasons: readonly string[] }[];
};

// The band the diff draws above the first file of a group.
export type DiffGroupBand = { key: string; label: string; count: number };

// Where each path sits in the order the groups give.
export const groupRank = (groups: readonly DiffFileGroup[]): ReadonlyMap<string, number> => {
	const rank = new Map<string, number>();
	for (const group of groups) for (const file of group.files) rank.set(file.path, rank.size);
	return rank;
};

// The words that say why a file sits in its group, such as "migration". The
// file header of the diff prints them after the path.
export const groupReasons = (groups: readonly DiffFileGroup[]): ReadonlyMap<string, readonly string[]> => {
	const reasons = new Map<string, readonly string[]>();
	for (const group of groups)
		for (const file of group.files) if (file.reasons.length > 0) reasons.set(file.path, file.reasons);
	return reasons;
};

// The band of each group, keyed by the path of the first file of that group
// that the diff draws. `shown` is the paths the diff draws, in order, so a
// filter that hides the first file of a group moves the band to the next file
// of the group, and a group with no file left draws no band. A path that no
// group names gets no band, and it sits after every path a group names.
export const groupBands = (
	groups: readonly DiffFileGroup[],
	shown: readonly string[],
): ReadonlyMap<string, DiffGroupBand> => {
	const drawn = new Set(shown);
	const bands = new Map<string, DiffGroupBand>();
	for (const group of groups) {
		const paths = group.files.map((file) => file.path).filter((path) => drawn.has(path));
		if (paths.length > 0) bands.set(paths[0]!, { key: group.key, label: group.label, count: paths.length });
	}
	return bands;
};
