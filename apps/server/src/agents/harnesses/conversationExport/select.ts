import type { ConversationInventory, ConversationSelection } from "./types";

export function selectConversationFiles(
	inventory: ConversationInventory,
	match: (path: string) => boolean,
	include: (path: string, transcript: string) => boolean = (path, transcript) => path === transcript,
): ConversationSelection {
	const transcripts = inventory.files.filter((file) => match(file.path));
	if (transcripts.length === 0) return { state: "unavailable", reason: "historical_content_missing" };
	if (transcripts.length !== 1) return { state: "unavailable", reason: "conversation_identity_ambiguous" };
	const transcript = transcripts[0]!.path;
	const files = inventory.files.filter((file) => include(file.path, transcript)).sort((a, b) => a.path.localeCompare(b.path));
	if (files.some((file) => file.kind !== "file")) return { state: "unavailable", reason: "conversation_file_unavailable" };
	const paths = new Set<string>();
	for (const file of files) {
		if (file.path.split("/").some((part) => part === "" || part === "." || part === "..") || file.path.includes("\\") || paths.has(file.path))
			return { state: "unavailable", reason: "conversation_path_invalid" };
		paths.add(file.path);
	}
	return { state: "selected", transcript, files };
}
