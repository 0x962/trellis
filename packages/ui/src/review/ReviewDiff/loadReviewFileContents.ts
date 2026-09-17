import type { ReviewFile } from "./parseReviewFiles";

export type LoadedReviewFileContents = { oldLines?: string[]; newLines?: string[] };

type LoadFile = (path: string, side: "old" | "new") => Promise<string>;

const splitContent = (content: string) => {
	const lines = content.split(/\r?\n/);
	if (lines.at(-1) === "") lines.pop();
	return lines;
};

// Both reads and the split live here, so the view calls one service
// function and renders what comes back.
export const loadReviewFileContents = async (
	loadFile: LoadFile,
	file: ReviewFile,
): Promise<LoadedReviewFileContents> => {
	const oldName = file.prevName ?? file.name;
	const [oldContent, newContent] = await Promise.all([
		file.type === "new" ? undefined : loadFile(oldName, "old"),
		file.type === "deleted" ? undefined : loadFile(file.name, "new"),
	]);
	return {
		...(oldContent === undefined ? {} : { oldLines: splitContent(oldContent) }),
		...(newContent === undefined ? {} : { newLines: splitContent(newContent) }),
	};
};
