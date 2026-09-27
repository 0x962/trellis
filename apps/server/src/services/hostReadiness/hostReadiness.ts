export type HostReadinessInput = {
	executables: readonly HostExecutableInput[];
	projects: readonly HostProjectInput[];
	repositories: readonly HostRepositoryInput[];
	workRoots: readonly HostWorkRootInput[];
	providers: readonly HostProviderInput[];
};

export type HostExecutableInput = {
	id: string;
	name: string;
	hostPath: string | null;
	installInstruction: string;
};

export type HostProjectInput = {
	id: string;
	key: string;
	name: string;
	hostPath: string;
	directoryPresent: boolean;
};

export type HostRepositoryInput = {
	id: string;
	projectId: string;
	name: string;
	hostPath: string;
	present: boolean;
};

export type HostWorkRootInput = {
	id: string;
	name: string;
	hostPath: string;
	present: boolean;
	writable: boolean;
};

export type HostProviderInput = {
	id: string;
	name: string;
	executableId: string;
	account: {
		id: string;
		name: string;
		hostProfilePath: string;
		credentialPresent: boolean;
	} | null;
	loginInstruction: string;
};

export type HostReadinessKind =
	| "executable"
	| "project-directory"
	| "repository"
	| "work-root"
	| "provider-credential";

export type HostReadinessPrerequisite = {
	id: string;
	kind: HostReadinessKind;
	name: string;
	detail: string;
	hostPath: string | null;
	instruction: string | null;
	projectId: string | null;
	providerIds: string[];
};

export type HostReadinessReport = {
	ready: boolean;
	satisfied: HostReadinessPrerequisite[];
	missing: HostReadinessPrerequisite[];
};

const toProjectDirectoryPrerequisite = (project: HostProjectInput): HostReadinessPrerequisite => ({
	id: `project:${project.id}`,
	kind: "project-directory",
	name: `${project.key}: ${project.name}`,
	detail: project.directoryPresent
		? "The project directory exists on the selected host."
		: "The project directory is missing from the selected host.",
	hostPath: project.hostPath,
	instruction: project.directoryPresent
		? null
		: `Create or select ${project.hostPath} on the selected host.`,
	projectId: project.id,
	providerIds: [],
});

const toRepositoryPrerequisite = (input: HostRepositoryInput): HostReadinessPrerequisite => ({
	id: `repository:${input.id}`,
	kind: "repository",
	name: input.name,
	detail: input.present
		? "The repository exists on the selected host."
		: "The repository is missing from the selected host.",
	hostPath: input.hostPath,
	instruction: input.present ? null : `Clone ${input.name} to ${input.hostPath} on the selected host.`,
	projectId: input.projectId,
	providerIds: [],
});

const toWorkRootPrerequisite = (input: HostWorkRootInput): HostReadinessPrerequisite => {
	const ready = input.present && input.writable;
	const detail = !input.present
		? "The work root is missing from the selected host."
		: input.writable
			? "The work root is writable on the selected host."
			: "The work root is not writable on the selected host.";
	return {
		id: `work-root:${input.id}`,
		kind: "work-root",
		name: input.name,
		detail,
		hostPath: input.hostPath,
		instruction: ready ? null : `Create a writable work root at ${input.hostPath} on the selected host.`,
		projectId: null,
		providerIds: [],
	};
};

const toExecutablePrerequisite = (
	input: HostExecutableInput,
	providers: readonly HostProviderInput[],
): HostReadinessPrerequisite => {
	const providerIds = providers.filter((provider) => provider.executableId === input.id).map((provider) => provider.id);
	return {
		id: `executable:${input.id}`,
		kind: "executable",
		name: input.name,
		detail:
			input.hostPath === null
				? "The executable is missing from the selected host."
				: "The executable is available on the selected host.",
		hostPath: input.hostPath,
		instruction: input.hostPath === null ? input.installInstruction : null,
		projectId: null,
		providerIds,
	};
};

const toProviderCredentialPrerequisite = (provider: HostProviderInput): HostReadinessPrerequisite => {
	const ready = provider.account?.credentialPresent === true;
	return {
		id: `provider-credential:${provider.id}`,
		kind: "provider-credential",
		name: provider.account === null ? `${provider.name} account` : `${provider.name}: ${provider.account.name}`,
		detail:
			provider.account === null
				? "No account is selected on the selected host."
				: ready
					? "The selected host has the account credential."
					: "The selected host does not have the account credential.",
		hostPath: provider.account?.hostProfilePath ?? null,
		instruction: ready ? null : provider.loginInstruction,
		projectId: null,
		providerIds: [provider.id],
	};
};

export function createHostReadinessReport(input: HostReadinessInput): HostReadinessReport {
	const prerequisites = [
		...input.executables.map((item) => toExecutablePrerequisite(item, input.providers)),
		...input.projects.map(toProjectDirectoryPrerequisite),
		...input.repositories.map(toRepositoryPrerequisite),
		...input.workRoots.map(toWorkRootPrerequisite),
		...input.providers.map(toProviderCredentialPrerequisite),
	];
	const satisfied = prerequisites.filter((item) => item.instruction === null);
	const missing = prerequisites.filter((item) => item.instruction !== null);
	return { ready: missing.length === 0, satisfied, missing };
}
