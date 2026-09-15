export type CopyEntry = {
	path: string;
	kind: "file" | "directory" | "symlink";
	bytes: number;
	mode: number;
	sha256?: string;
	link?: string;
	copyLink?: string;
};
export type CopyPlan = { entries: CopyEntry[]; excluded: string[]; version: string; bytes: number };
