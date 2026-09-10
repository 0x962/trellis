import {
	agentLaunch,
	agentTitle,
	builderBranch,
	managerBranch,
	managerWorkspaceName,
	projectTag,
	type RunnerProject,
	restartText,
	resumeCommand,
} from "@trellis/api";
import { matchRunnerProject, type Runner, runnerUnavailable, type TerminalState } from "./runner.ts";
import { type FolderTrust, isTrusted, type SeedReport, seedFolders } from "./trust.ts";

// The Runner over the `superset` command line (Superset 1.27). `bin` is
// TRELLIS_SUPERSET_BIN or "superset" on PATH. `url` is the trellis server
// the agents talk to. Every child gets process.env as it is at the spawn.
//
// Superset runs each agent as the `--command` of a workspace or a
// terminal, so the tab shows the name claude gets from `-n`.
//
// Claude asks about folder trust before it reads its prompt, so a start
// seeds the trust first. It seeds the trusted roots of the project, which
// hold the repo root of the runner project. Claude treats a repo root as
// the trust domain of every git worktree cut from that repo, so a
// worktree that sits outside every root still runs. A start also seeds
// the workspace worktree when a trusted root covers that folder.

type WorkspaceAnswer = {
	workspace: { id: string; worktreePath?: string | null };
	terminals: Array<{ terminalId: string }>;
	alreadyExists: boolean;
};

type WorkspaceInput = {
	runnerProjectId: string;
	name: string;
	branch: string;
	baseBranch: string;
	tag: string;
	command: string;
};

const isMissing = (error: unknown) => (error as { code?: string }).code === "ENOENT";

// Resolves with stdout. A missing binary is the reason `missing`; a nonzero
// exit is `error`, with what superset printed on stderr.
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
	if (code !== 0) throw runnerUnavailable("error", `superset ${args.slice(0, 2).join(" ")}: ${stderr.trim()}`);
	return stdout;
};

// One row of `superset projects list --json`. A project with no remote has
// no repo.
type ListedProject = { id: string; name: string; repo?: string | null; path: string };

export type SupersetRunnerOptions = { bin: string; url: string; trust: FolderTrust };

export const createSupersetRunner = ({ bin, url, trust }: SupersetRunnerOptions): Runner => {
	const run = (args: string[]) => spawnSuperset(bin, args);
	const json = async <T>(args: string[]) => JSON.parse(await run([...args, "--json"])) as T;

	const terminals = async (workspaceId: string): Promise<TerminalState[]> => {
		const answer = await json<{ sessions: TerminalState[] }>(["terminals", "list", "--workspace", workspaceId]);
		return answer.sessions.map(({ terminalId, exited, title }) => ({ terminalId, exited, title }));
	};

	const openUrl = async (workspaceId: string) => (await run(["ws", "open", workspaceId, "--print"])).trim();

	const newTerminal = async (workspaceId: string, command: string) =>
		(await json<{ terminalId: string }>(["terminals", "create", "--workspace", workspaceId, "--command", command]))
			.terminalId;

	// A workspace with `branch` answers alreadyExists and runs no command, so a
	// second start of the same agent reaches the first workspace.
	const createWorkspace = (input: WorkspaceInput) =>
		json<WorkspaceAnswer>([
			...["ws", "create", "--local", "--project", input.runnerProjectId, "--name", input.name],
			...["--branch", input.branch, "--skip-branch-prefix", "--base-branch", input.baseBranch],
			...["--tag", input.tag, "--command", input.command],
		]);

	// The tab that `answer` started, or in a workspace that already existed,
	// its live tab named `title`, or else a new tab that runs `command`.
	const tabOf = async (answer: WorkspaceAnswer, title: string, command: string) => {
		if (!answer.alreadyExists) return { terminalId: answer.terminals[0]!.terminalId, started: true };
		const live = (await terminals(answer.workspace.id)).find((tab) => !tab.exited && tab.title === title);
		if (live !== undefined) return { terminalId: live.terminalId, started: false };
		return { terminalId: await newTerminal(answer.workspace.id, command), started: true };
	};

	const managerCommand = (project: string, claudeSessionId: string | null, text: string) =>
		claudeSessionId === null
			? agentLaunch({ role: "manager", project, url }).command
			: resumeCommand({ project, sessionId: claudeSessionId, text, url });

	const projects = async (): Promise<RunnerProject[]> =>
		(await json<ListedProject[]>(["projects", "list"])).map(({ id, name, repo, path }) => ({
			id,
			name,
			repo: repo ?? null,
			path,
		}));

	// Every folder the project trusts, before the workspace runs its
	// command. A project with no trusted folder gets a rootless report and
	// no write.
	const seedRoots = (roots: string[]): Promise<SeedReport> => seedFolders(trust, roots, roots);

	// The workspace's own worktree, when a trusted root covers it.
	const seedWorktree = async (report: SeedReport, answer: WorkspaceAnswer, roots: string[]) => {
		const worktree = answer.workspace.worktreePath;
		if (typeof worktree !== "string" || !isTrusted(worktree, roots)) return report;
		if ((await trust.trust(worktree)) === "seeded") report.seeded.push(worktree);
		return report;
	};

	return {
		projects,

		projectFor: async (repos) => {
			const found = matchRunnerProject(await projects(), repos);
			if (found === null) throw runnerUnavailable("unmapped");
			return found;
		},

		ensureManager: async (input) => {
			const command = managerCommand(input.project, input.claudeSessionId, input.text ?? restartText(input.project));
			const trusted = await seedRoots(input.trustedRoots);
			const answer = await createWorkspace({
				runnerProjectId: input.runnerProjectId,
				name: managerWorkspaceName(input.project),
				branch: managerBranch(input.project),
				baseBranch: input.baseBranch,
				tag: projectTag(input.project),
				command,
			});
			const tab = await tabOf(answer, agentTitle({ role: "manager", project: input.project }), command);
			const report = await seedWorktree(trusted, answer, input.trustedRoots);
			return { workspaceId: answer.workspace.id, ...tab, trust: report, openUrl: await openUrl(answer.workspace.id) };
		},

		startBuilder: async (input) => {
			const command = agentLaunch({ role: "builder", project: input.project, ticket: input.ticket, url }).command;
			const trusted = await seedRoots(input.trustedRoots);
			const answer = await createWorkspace({
				runnerProjectId: input.runnerProjectId,
				name: input.ticket,
				branch: builderBranch(input.ticket, input.title),
				baseBranch: input.baseBranch,
				tag: projectTag(input.project),
				command,
			});
			const { terminalId } = await tabOf(answer, input.ticket, command);
			const report = await seedWorktree(trusted, answer, input.trustedRoots);
			return {
				workspaceId: answer.workspace.id,
				terminalId,
				trust: report,
				openUrl: await openUrl(answer.workspace.id),
			};
		},

		startReviewer: async (input) => {
			const command = agentLaunch({ role: "reviewer", ...input, url }).command;
			return { terminalId: await newTerminal(input.workspaceId, command) };
		},

		// Superset types the text as a paste and presses Enter. Text typed into
		// a bare shell would run as a command, so an exited terminal never gets
		// it; the manager starts again with the text as its prompt instead.
		wake: async (session, text) => {
			const tab = (await terminals(session.workspaceId)).find((found) => found.terminalId === session.terminalId);
			if (tab !== undefined && !tab.exited) {
				await run([
					"terminals",
					"send",
					"--workspace",
					session.workspaceId,
					"--terminal",
					session.terminalId,
					"--text",
					text,
				]);
				return { terminalId: session.terminalId, relaunched: false };
			}
			const command = managerCommand(session.project, session.claudeSessionId, text);
			return { terminalId: await newTerminal(session.workspaceId, command), relaunched: true };
		},

		isAlive: async (ref) =>
			(await terminals(ref.workspaceId)).some((tab) => tab.terminalId === ref.terminalId && !tab.exited),

		terminals,

		// A terminal that is already gone needs no close.
		stop: async (ref) => {
			const listed = (await terminals(ref.workspaceId)).some((tab) => tab.terminalId === ref.terminalId);
			if (listed) await run(["terminals", "close", "--workspace", ref.workspaceId, "--terminal", ref.terminalId]);
		},

		removeWorkspace: async (workspaceId) => {
			await run(["ws", "delete", workspaceId, "--local"]);
		},

		openUrl,
	};
};
