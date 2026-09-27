export type ContainerLogEntry = {
	event: string;
	service?: "runtime" | "host";
	pid?: number;
	exitCode?: number;
};

export type ContainerLogger = (entry: ContainerLogEntry) => void;

export const createContainerLogger = (releaseId: string, installationId: string): ContainerLogger =>
	(entry) =>
		process.stdout.write(`${JSON.stringify({ ...entry, releaseId, installationId })}\n`);
