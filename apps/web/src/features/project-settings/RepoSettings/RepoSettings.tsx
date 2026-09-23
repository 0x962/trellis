import { Plus, Trash } from "@phosphor-icons/react";
import type { Project } from "@trellis/api";
import { Button, GithubMark, IconButton, Input } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";

export type RepoSettingsProps = {
	project: Project;
};

export function RepoSettings({ project }: RepoSettingsProps) {
	const { client, queryClient } = useApp();
	const [value, setValue] = useState("");
	const [message, setMessage] = useState<string | null>(null);

	const save = async (repos: { owner: string; repo: string }[]) => {
		try {
			await client.projects.setRepos({ project: project.key, repos });
			setMessage(null);
			await queryClient.invalidateQueries();
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	const add = async (event: FormEvent) => {
		event.preventDefault();
		const match = /^(?:https:\/\/github\.com\/)?([a-z0-9_.-]+)\/([a-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
			value.trim().toLowerCase(),
		);
		if (match === null) {
			setMessage("Use a GitHub URL or owner/repository.");
			return;
		}
		await save([...project.repos.map(({ owner, repo }) => ({ owner, repo })), { owner: match[1]!, repo: match[2]! }]);
		setValue("");
	};

	const remove = (owner: string, repo: string) =>
		save(project.repos.filter((entry) => entry.owner !== owner || entry.repo !== repo));

	return (
		<section className="project-settings-group">
			<div className="flex flex-col gap-1">
				<h3 className="project-settings-group-title">Repositories</h3>
				<p className="text-sm leading-relaxed text-fg-muted">
					Connect GitHub repositories to find pull requests that reference project tickets.
				</p>
			</div>
			{project.repos.length === 0 ? (
				<p className="text-sm text-fg-muted">
					No repositories connected. Add a repository to link its pull requests to tickets.
				</p>
			) : (
				<ul className="flex flex-col gap-1">
					{project.repos.map((repo) => (
						<li
							key={`${repo.owner}/${repo.repo}`}
							className="flex h-8 items-center rounded-md border border-border bg-surface px-2"
						>
							<a
								href={`https://github.com/${repo.owner}/${repo.repo}`}
								target="_blank"
								rel="noreferrer"
								className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-accent underline"
							>
								<GithubMark aria-hidden="true" className="size-3.5 shrink-0" />
								<span className="truncate">
									{repo.owner}/{repo.repo}
								</span>
							</a>
							<IconButton
								size="xs"
								label={`Remove ${repo.owner}/${repo.repo}`}
								icon={<Trash />}
								onClick={() => void remove(repo.owner, repo.repo)}
							/>
						</li>
					))}
				</ul>
			)}
			<form onSubmit={(event) => void add(event)} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
				<Input
					label="Repository"
					placeholder="https://github.com/owner/repository"
					value={value}
					invalid={message !== null}
					onChange={(event) => setValue(event.target.value)}
				/>
				<Button type="submit" icon={<Plus />}>
					Add repository
				</Button>
			</form>
			{message !== null && (
				<p role="alert" className="text-sm text-danger">
					{message}
				</p>
			)}
		</section>
	);
}
