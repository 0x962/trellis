export type HomeImportPaths = { source: string; target: string };
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
export type ImportInventory = {
	counts: { projects: number; tickets: number; agents: number; attachments: number; artifacts: number; checks: number };
	blockers: string[];
	workspaceReferences: { id: string; runtime: string; workspaceId: string | null; conversationId: string | null }[];
	original: {
		projects: {
			id: string;
			configHash: string;
			ade: string;
			directory: string;
			dispatchPaused: boolean;
			trustedDirectory: boolean;
		}[];
		settings: { agentsEnabled: boolean; agentsHash: string; nativeWorkPaused: boolean };
	};
};
export type HomeImportPreview = HomeImportPaths &
	ImportInventory & { version: string; files: number; bytes: number; excluded: string[] };
export type HomeImportResult = HomeImportPreview & { id: string; state: "prepared"; createdAt: string };
