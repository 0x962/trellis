export type StandaloneCandidate = {
	home: string;
	backupPath: string;
	service: { label: "com.trellis.server"; domain: string; pid: number; port: number | null } | null;
};

export type StandaloneHandoffResult = {
	home: string;
	backupPath: string;
	automationPaused: true;
	restoreCommands: { command: string; args: string[] }[];
};
