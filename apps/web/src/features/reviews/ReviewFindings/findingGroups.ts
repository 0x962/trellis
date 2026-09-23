import type { ReviewThread } from "@trellis/api";

// The threads of one revision of the pull request, for the Findings
// section. `current` is true for the revision the Diff tab draws.
export type FindingGroup = {
	// The revision the threads name, or the empty text for the threads that
	// name none. The CLI writes those before the pull request has a revision.
	revisionId: string;
	current: boolean;
	// The newest moment a thread of this group was written.
	writtenAt: string;
	open: ReviewThread[];
	resolved: ReviewThread[];
};

const byNewest = (left: ReviewThread, right: ReviewThread) => right.createdAt.localeCompare(left.createdAt);

// Every thread of the pull request, in groups of one revision each, newest
// revision first. A revision has no order of its own here, so the moment of
// its newest thread orders the groups. The revision on screen leads, so the
// reader meets the findings of the code in front of them first.
export const findingGroups = (threads: ReviewThread[], revisionId: string | null): FindingGroup[] => {
	const groups = new Map<string, FindingGroup>();
	for (const thread of threads) {
		const key = thread.revisionId ?? "";
		const group =
			groups.get(key) ??
			({
				revisionId: key,
				current: key !== "" && key === revisionId,
				writtenAt: "",
				open: [],
				resolved: [],
			} as FindingGroup);
		groups.set(key, group);
		if (thread.status === "resolved") group.resolved.push(thread);
		else group.open.push(thread);
		if (thread.createdAt > group.writtenAt) group.writtenAt = thread.createdAt;
	}
	for (const group of groups.values()) {
		group.open.sort(byNewest);
		group.resolved.sort(byNewest);
	}
	return [...groups.values()].sort((left, right) => {
		if (left.current !== right.current) return left.current ? -1 : 1;
		return right.writtenAt.localeCompare(left.writtenAt);
	});
};

// The words a finding row opens with: the first line of the comment. A
// comment that opens with a suggestion block names the change instead.
export const findingSummary = (body: string) => {
	const first = body.split("\n")[0]?.trim() ?? "";
	if (/^(`{3,}|~{3,})\s*suggestion/i.test(first)) return "Suggested change";
	return first === "" ? "(no text)" : first;
};
