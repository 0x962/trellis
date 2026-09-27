import type {
	LinuxCommandResult,
	LinuxServiceDependencies,
	LinuxServiceName,
	LinuxServiceProcessStatus,
	LinuxServiceSelection,
} from "../types/index.ts";

export const orderedServicesFor = (
	selection: LinuxServiceSelection,
	order: "start" | "stop" = "start",
): LinuxServiceName[] => {
	if (selection !== "all") return [selection];
	return order === "start" ? ["runtime", "host"] : ["host", "runtime"];
};

export const runSystemctl = async (
	deps: Pick<LinuxServiceDependencies, "run">,
	args: string[],
): Promise<LinuxCommandResult> => {
	const command = ["systemctl", "--user", ...args];
	const result = await deps.run(command);
	if (result.code !== 0)
		throw new Error(`${command.join(" ")} failed with exit code ${result.code}: ${result.stderr.trim()}`);
	return result;
};

export const parseSystemdStatus = (output: string): LinuxServiceProcessStatus => {
	const fields = Object.fromEntries(
		output
			.trim()
			.split("\n")
			.map((line) => line.split("=", 2) as [string, string]),
	);
	return {
		activeState: fields.ActiveState!,
		subState: fields.SubState!,
		mainPid: Number(fields.MainPID),
	};
};
