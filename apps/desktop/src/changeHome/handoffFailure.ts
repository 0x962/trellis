import type { StandaloneHandoffResult } from "../standaloneHandoff/types.ts";

export const handoffFailure = (error: unknown, prepared?: StandaloneHandoffResult): string => {
	const message = (error as Error).message;
	if (!prepared) return message;
	const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
	return [
		message,
		`The selected database is prepared and its automation is paused: ${prepared.home}`,
		`Backup: ${prepared.backupPath}`,
		...(prepared.restoreCommands.length
			? [
					"The standalone service stays disabled. Stop any desktop host and review the backup before you restore its registration:",
					...prepared.restoreCommands.map(({ command, args }) => [command, ...args].map(quote).join(" ")),
				]
			: []),
	].join("\n\n");
};
