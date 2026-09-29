import type { SessionUpdate } from "../../types";

export const localDay = (value: string) => {
	const date = new Date(value);
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

export const updateTitle = (body: string) =>
	body
		.split("\n")
		.find((line) => line.trim())
		?.replace(/^\s{0,3}#{1,6}\s+/, "")
		.trim() || "Status update";

export function timelineGroups(updates: SessionUpdate[], now: string) {
	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	const groups = new Map<string, { key: string; label: string; updates: SessionUpdate[] }>();
	for (const update of [...updates].sort(
		(a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
	)) {
		const key = localDay(update.createdAt);
		let group = groups.get(key);
		if (!group) {
			const label =
				key === localDay(now)
					? "Today"
					: key === localDay(yesterday.toISOString())
						? "Yesterday"
						: new Date(update.createdAt).toLocaleDateString(undefined, {
								month: "long",
								day: "numeric",
								year: "numeric",
							});
			group = { key, label, updates: [] };
			groups.set(key, group);
		}
		group.updates.push(update);
	}
	return [...groups.values()];
}
