import {
	agentLaunch,
	agentTitle,
	builderBranch,
	managerBranch,
	managerWorkspaceName,
	projectTag,
	restartText,
	resumeCommand,
} from "@trellis/api";
import { branchState } from "./git.ts";
import {
	matchRunnerProject,
	type Runner,
	type RunnerHostId,
	type RunnerProjectRow,
	runnerUnavailable,
	type TerminalState,
} from "./runner.ts";
import { hostCalls, onHost, target } from "./supersetHost.ts";

// The Runner over the `superset` command line (Superset 1.27). `bin` is
// TRELLIS_SUPERSET_BIN or "superset" on PATH. `url` is the trellis server
// the agents talk to. Every child gets process.env as it is at the spawn.
//
// Superset runs each agent as the `--command` of a workspace or a
// terminal, so the tab shows the name claude gets from `-n`.

// A new workspace lists the terminal of `--command` with the label
// "Command". A project with a setup script also gets a "Workspace Setup"
// terminal, which Superset can list first and which exits when the script
// ends.
type WorkspaceAnswer = {
	workspace: { id: string };
	terminals: Array<{ terminalId: string; label: string }>;
	alreadyExists: boolean;
};

const COMMAND_LABEL = "Command";

type WorkspaceInput = {
	runnerProjectId: string;
	host: RunnerHostId;
	name: string;
	branch: string;
	baseBranch: string;
	tag: string;
	command: string;
};

const isMissing = (error: unknown) => (error as { code?: string }).code === "ENOENT";

// Resolves with stdout. A missing binary is the reason `missing`; a nonzero
// exit is `error`, with what superset printed on stderr. Superset prints some
// errors as JSON on stdout and nothing on stderr, so an empty stderr gives
// stdout instead.
const spawnSuperset = async (bin: string, args: string[]) => {
	let proc: ReturnType<typeof Bun.spawn>;
	try {
		proc = Bun.spawn([bin, ...args], { env: process.env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	} catch (error) {
		if (isMissing(error)) throw runnerUnavailable("missing", `superset binary not found: ${bin}`);
		throw error;
	}
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout as ReadableStream).text(),
		new Response(proc.stderr as ReadableStream).text(),
		proc.exited,
	]);
	if (code !== 0) {
		const printed = stderr.trim() === "" ? stdout.trim() : stderr.trim();
		throw runnerUnavailable("error", `superset ${args.slice(0, 2).join(" ")}: ${printed}`);
	}
	return stdout;
};

const ORIGIN_HEAD = "refs/remotes/origin/";

// The branch that origin/HEAD names in the checkout at `path`, as `git
// clone` records it. A checkout without origin/HEAD is the reason `error`,
// with what git printed.
const branchAt = async (path: string) => {
	const proc = Bun.spawn(["git", "-C", path, "symbolic-ref", `${ORIGIN_HEAD}HEAD`], {
		env: process.env,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw runnerUnavailable("error", `git symbolic-ref origin/HEAD in ${path}: ${stderr.trim()}`);
	return stdout.trim().slice(ORIGIN_HEAD.length);
};

// One row of `superset projects list --json`. A project with no remote has
// no repo.
type ListedProject = { id: string; name: string; repo?: string | null; path: string };

export const createSupersetRunner = ({ bin, url }: { bin: string; url: string }): Runner => {
	const run = (args: string[]) => spawnSuperset(bin, args);
	const json = async <T>(args: string[]) => JSON.parse(await run([...args, "--json"])) as T;

	const terminals = async (workspaceId: string, host: RunnerHostId): Promise<TerminalState[]> => {
		const answer = await json<{ sessions: TerminalState[] }>([
			...["terminals", "list", "--workspace", workspaceId],
			...onHost(host),
		]);
		return answer.sessions.map(({ terminalId, exited, title }) => ({ terminalId, exited, title }));
	};

	const openUrl = async (workspaceId: string, host: RunnerHostId) =>
		(await run(["ws", "open", workspaceId, "--print", ...onHost(host)])).trim();

	const newTerminal = async (workspaceId: string, host: RunnerHostId, command: string) =>
		(
			await json<{ terminalId: string }>([
				...["terminals", "create", "--workspace", workspaceId, "--command", command],
				...onHost(host),
			])
		).terminalId;

	const { hosts, assertHost } = hostCalls(json);

	// A workspace with `branch` answers alreadyExists and runs no command, so a
	// second start of the same agent reaches the first workspace.
	const createWorkspace = (input: WorkspaceInput) =>
		json<WorkspaceAnswer>([
			...["ws", "create", ...target(input.host), "--project", input.runnerProjectId, "--name", input.name],
			...["--branch", input.branch, "--skip-branch-prefix", "--base-branch", input.baseBranch],
			...["--tag", input.tag, "--command", input.command],
		]);

	// The Command tab that `answer` started, or in a workspace that already
	// existed, its live tab named `title`, or else a new tab that runs
	// `command`.
	const tabOf = async (answer: WorkspaceAnswer, host: RunnerHostId, title: string, command: string) => {
		if (!answer.alreadyExists) {
			const tab = answer.terminals.find((terminal) => terminal.label === COMMAND_LABEL)!;
			return { terminalId: tab.terminalId, started: true };
		}
		const live = (await terminals(answer.workspace.id, host)).find((tab) => !tab.exited && tab.title === title);
		if (live !== undefined) return { terminalId: live.terminalId, started: false };
		return { terminalId: await newTerminal(answer.workspace.id, host, command), started: true };
	};

	const managerCommand = (project: string, claudeSessionId: string | null, text: string) =>
		claudeSessionId === null
			? agentLaunch({ role: "manager", project, url }).command
			: resumeCommand({ project, sessionId: claudeSessionId, text, url });

	const projects = async (): Promise<RunnerProjectRow[]> =>
		(await json<ListedProject[]>(["projects", "list"])).map(({ id, name, repo, path }) => ({
			id,
			name,
			repo: repo ?? null,
			path,
		}));

	return {
		projects,
		hosts,

		projectFor: async (repos) => {
			const found = matchRunnerProject(await projects(), repos);
			if (found === null) throw runnerUnavailable("unmapped");
			return found;
		},

		defaultBranch: async (runnerProjectId) => {
			const found = (await projects()).find((project) => project.id === runnerProjectId);
			if (found === undefined) throw runnerUnavailable("unmapped", `no Superset project ${runnerProjectId}`);
			return branchAt(found.path);
		},

		branchAt,

		branchState: async (runnerProjectId, branch) => {
			const found = (await projects()).find((project) => project.id === runnerProjectId);
			if (found === undefined) return "unreadable";
			return branchState(found.path, branch);
		},

		ensureManager: async (input) => {
			await assertHost(input.host);
			const command = managerCommand(input.project, input.claudeSessionId, input.text ?? restartText(input.project));
			const answer = await createWorkspace({
				runnerProjectId: input.runnerProjectId,
				host: input.host,
				name: managerWorkspaceName(input.project),
				branch: managerBranch(input.project),
				baseBranch: input.baseBranch,
				tag: projectTag(input.project),
				command,
			});
			const tab = await tabOf(answer, input.host, agentTitle({ role: "manager", project: input.project }), command);
			return { workspaceId: answer.workspace.id, ...tab, openUrl: await openUrl(answer.workspace.id, input.host) };
		},

		startBuilder: async (input) => {
			await assertHost(input.host);
			const command = agentLaunch({ role: "builder", project: input.project, ticket: input.ticket, url }).command;
			const answer = await createWorkspace({
				runnerProjectId: input.runnerProjectId,
				host: input.host,
				name: input.ticket,
				branch: builderBranch(input.ticket, input.title),
				baseBranch: input.baseBranch,
				tag: projectTag(input.project),
				command,
			});
			const { terminalId } = await tabOf(answer, input.host, input.ticket, command);
			return {
				workspaceId: answer.workspace.id,
				terminalId,
				openUrl: await openUrl(answer.workspace.id, input.host),
			};
		},

		startReviewer: async (input) => {
			await assertHost(input.host);
			const command = agentLaunch({ role: "reviewer", ...input, url }).command;
			return { terminalId: await newTerminal(input.workspaceId, input.host, command) };
		},

		// Superset types the text as a paste and presses Enter. Text typed into
		// a bare shell would run as a command, so an exited terminal never gets
		// it; the manager starts again with the text as its prompt instead.
		wake: async (session, text) => {
			await assertHost(session.host);
			const tab = (await terminals(session.workspaceId, session.host)).find(
				(found) => found.terminalId === session.terminalId,
			);
			if (tab !== undefined && !tab.exited) {
				await run([
					...["terminals", "send", "--workspace", session.workspaceId, "--terminal", session.terminalId],
					...["--text", text],
					...onHost(session.host),
				]);
				return { terminalId: session.terminalId, relaunched: false };
			}
			const command = managerCommand(session.project, session.claudeSessionId, text);
			return { terminalId: await newTerminal(session.workspaceId, session.host, command), relaunched: true };
		},

		isAlive: async (ref) =>
			(await terminals(ref.workspaceId, ref.host)).some((tab) => tab.terminalId === ref.terminalId && !tab.exited),

		terminals,

		// A terminal that is already gone needs no close.
		stop: async (ref) => {
			const listed = (await terminals(ref.workspaceId, ref.host)).some((tab) => tab.terminalId === ref.terminalId);
			if (listed) {
				await run([
					...["terminals", "close", "--workspace", ref.workspaceId, "--terminal", ref.terminalId],
					...onHost(ref.host),
				]);
			}
		},

		removeWorkspace: async (workspaceId, host) => {
			await run(["ws", "delete", workspaceId, ...target(host)]);
		},

		openUrl,
	};
};
