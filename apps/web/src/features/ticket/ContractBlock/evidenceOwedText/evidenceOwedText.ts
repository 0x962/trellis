import { contractFloor, evidenceWords } from "@trellis/api";

export function evidenceOwedText(repo: string | undefined, files: readonly string[]): string {
	const floor = contractFloor(repo, { files: [...files] });
	if (floor === null) return "unknown. The contract names no file.";
	return `${floor.kind}: ${floor.required.map((item) => evidenceWords[item]).join(" · ")}`;
}
