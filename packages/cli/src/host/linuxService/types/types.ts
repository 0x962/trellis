import type { HostReleaseManifest } from "@trellis/api";

export type LinuxServiceName = "host" | "runtime";
export type LinuxServiceSelection = LinuxServiceName | "all";
export type LinuxServicePreflightContext = "foreground" | "systemd";

export type LinuxCommandResult = {
	code: number;
	stdout: string;
	stderr: string;
};

export type LinuxServiceDependencies = {
	platform: NodeJS.Platform;
	arch: string;
	home: string;
	env: Record<string, string | undefined>;
	randomToken: () => string;
	preflight: (releaseRoot: string, context: LinuxServicePreflightContext) => Promise<void>;
	run: (args: string[]) => Promise<LinuxCommandResult>;
};

export type LinuxServiceInstallInput = {
	releaseRoot: string;
	dataHome?: string;
	host?: string;
	port?: number;
};

export type LinuxForegroundInput = LinuxServiceInstallInput & {
	service: LinuxServiceName;
	authToken?: string;
};

export type LinuxServiceProcessStatus = {
	activeState: string;
	subState: string;
	mainPid: number;
};

export type LinuxServiceStatus = {
	host: LinuxServiceProcessStatus;
	runtime: LinuxServiceProcessStatus;
};

export type LinuxForegroundCommand = {
	executable: string;
	args: string[];
	env: Record<string, string>;
};

export type LinuxServiceInstallation = {
	schemaVersion: 1;
	releaseRoot: string;
	releaseId: string;
	dataHome: string;
	host: string;
	port: number;
};

export type LinuxRelease = {
	root: string;
	manifest: HostReleaseManifest;
};
