import { contractFloor, evidenceWords } from "@trellis/api";

export function evidenceOwedText(repo: string | undefined, files: readonly string[]): string {
	if (repo === undefined) return "unknown. The project uses no repository, or more than one.";
	const floor = contractFloor(repo, { files: [...files] });
	if (floor === null) return "unknown. The contract names no file.";
	return `${floor.kind}: ${floor.required.map((item) => evidenceWords[item]).join(" · ")}`;
}
