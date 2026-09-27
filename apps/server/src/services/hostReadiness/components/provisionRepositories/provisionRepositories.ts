import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type HostRepositoryProvisionInput = {
	gitExecutableHostPath: string;
	repositories: readonly {
		id: string;
		name: string;
		cloneUrl: string;
		hostPath: string;
		present: boolean;
	}[];
};

export type ProvisionedHostRepository = {
	id: string;
	name: string;
	hostPath: string;
};

export type HostRepositoryCloneFailure = "authentication" | "not-found" | "permission" | "network" | "unknown";

export type HostRepositoryProvisionLogContext = {
	repositoryId: string;
	hostPath: string;
	gitExecutableHostPath: string;
	action: "clone";
	exitCode: number;
	detail: string | null;
};

export type HostRepositoryProvisionLog = (message: string, context: HostRepositoryProvisionLogContext) => void;

export type HostRepositoryProvisionIo = {
	ensureParent(path: string): Promise<void>;
	clone(input: {
		gitExecutableHostPath: string;
		cloneUrl: string;
		hostPath: string;
	}): Promise<{ exitCode: number; failure: HostRepositoryCloneFailure | null }>;
};

const failureDetail: Record<HostRepositoryCloneFailure, string> = {
	authentication: "Git reported an authentication failure.",
	"not-found": "Git could not find the repository.",
	permission: "Git reported denied permission.",
	network: "Git could not connect to the repository host.",
	unknown: "Git clone failed without an approved detail.",
};

const toCloneFailure = (stderr: string): HostRepositoryCloneFailure => {
	const text = stderr.toLowerCase();
	if (text.includes("authentication failed") || text.includes("could not read username")) return "authentication";
	if (text.includes("repository not found") || text.includes("not found")) return "not-found";
	if (text.includes("permission denied")) return "permission";
	if (text.includes("could not resolve host") || text.includes("connection timed out")) return "network";
	return "unknown";
};

const io: HostRepositoryProvisionIo = {
	ensureParent: async (path) => {
		await mkdir(path, { recursive: true });
	},
	clone: async (input) => {
		const process = Bun.spawn(
			[input.gitExecutableHostPath, "clone", "--quiet", "--", input.cloneUrl, input.hostPath],
			{ stdin: "ignore", stdout: "ignore", stderr: "pipe" },
		);
		const [stderr, exitCode] = await Promise.all([new Response(process.stderr).text(), process.exited]);
		return { exitCode, failure: exitCode === 0 ? null : toCloneFailure(stderr) };
	},
};

const credentialFreeCloneUrl = (repository: { id: string; cloneUrl: string }) => {
	if (!URL.canParse(repository.cloneUrl))
		throw new Error(`Repository ${repository.id} needs a credential-free HTTPS clone URL.`);
	const url = new URL(repository.cloneUrl);
	if (
		url.protocol !== "https:" ||
		url.username !== "" ||
		url.password !== "" ||
		url.search !== "" ||
		url.hash !== ""
	)
		throw new Error(`Repository ${repository.id} needs a credential-free HTTPS clone URL.`);
	return url.toString();
};

export async function provisionHostRepositories(
	input: HostRepositoryProvisionInput,
	log: HostRepositoryProvisionLog,
	provisionIo: HostRepositoryProvisionIo = io,
): Promise<ProvisionedHostRepository[]> {
	const provisioned: ProvisionedHostRepository[] = [];
	for (const repository of input.repositories) {
		if (repository.present) continue;
		const cloneUrl = credentialFreeCloneUrl(repository);
		await provisionIo.ensureParent(dirname(repository.hostPath));
		const result = await provisionIo.clone({
			gitExecutableHostPath: input.gitExecutableHostPath,
			cloneUrl,
			hostPath: repository.hostPath,
		});
		const detail = result.failure === null ? null : failureDetail[result.failure];
		log("host repository provision", {
			repositoryId: repository.id,
			hostPath: repository.hostPath,
			gitExecutableHostPath: input.gitExecutableHostPath,
			action: "clone",
			exitCode: result.exitCode,
			detail,
		});
		if (result.exitCode !== 0)
			throw new Error(
				`Could not provision ${repository.name} at ${repository.hostPath} on the selected host. Git exited with code ${result.exitCode}. ${detail}`,
			);
		provisioned.push({ id: repository.id, name: repository.name, hostPath: repository.hostPath });
	}
	return provisioned;
}
