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

export type HostRepositoryProvisionDependencies = {
	ensureParent(path: string): Promise<void>;
	clone(input: { gitExecutableHostPath: string; cloneUrl: string; hostPath: string }): Promise<number>;
};

const dependencies: HostRepositoryProvisionDependencies = {
	ensureParent: async (path) => {
		await mkdir(path, { recursive: true });
	},
	clone: async (input) => {
		const process = Bun.spawn(
			[input.gitExecutableHostPath, "clone", "--", input.cloneUrl, input.hostPath],
			{ stdin: "ignore", stdout: "ignore", stderr: "ignore" },
		);
		return process.exited;
	},
};

export async function provisionHostRepositories(
	input: HostRepositoryProvisionInput,
	deps: HostRepositoryProvisionDependencies = dependencies,
): Promise<ProvisionedHostRepository[]> {
	const provisioned: ProvisionedHostRepository[] = [];
	for (const repository of input.repositories) {
		if (repository.present) continue;
		await deps.ensureParent(dirname(repository.hostPath));
		const code = await deps.clone({
			gitExecutableHostPath: input.gitExecutableHostPath,
			cloneUrl: repository.cloneUrl,
			hostPath: repository.hostPath,
		});
		if (code !== 0)
			throw new Error(`Could not provision ${repository.name} at ${repository.hostPath} on the selected host.`);
		provisioned.push({ id: repository.id, name: repository.name, hostPath: repository.hostPath });
	}
	return provisioned;
}
