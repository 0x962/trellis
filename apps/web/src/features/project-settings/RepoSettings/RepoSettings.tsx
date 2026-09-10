import type { Project } from "@trellis/api";
import { Button, IconButton, Input } from "@trellis/ui";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { SettingsSection } from "../SettingsSection";

export type RepoSettingsProps = {
	project: Project;
};

export function RepoSettings({ project }: RepoSettingsProps) {
	const { client, queryClient } = useApp();
	const [value, setValue] = useState("");
	const [message, setMessage] = useState<string | null>(null);

	const save = async (repos: { owner: string; repo: string }[]) => {
		try {
			await client.projects.setRepos({ project: project.path, repos });
			setMessage(null);
			await queryClient.invalidateQueries();
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	const add = async (event: FormEvent) => {
		event.preventDefault();
		const match = /^([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/.exec(value.trim().toLowerCase());
		if (match === null) {
			setMessage("Use owner/repository in lower case.");
			return;
		}
		await save([...project.repos.map(({ owner, repo }) => ({ owner, repo })), { owner: match[1]!, repo: match[2]! }]);
		setValue("");
	};

	const remove = (owner: string, repo: string) =>
		save(project.repos.filter((entry) => entry.owner !== owner || entry.repo !== repo));

	return (
		<SettingsSection title="Repositories" hint="The GitHub poller scans these repositories for ticket links.">
			{project.repos.length === 0 ? (
				<p className="text-sm text-fg-muted">No repositories.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{project.repos.map((repo) => (
						<li
							key={`${repo.owner}/${repo.repo}`}
							className="flex h-8 items-center rounded-md border border-border bg-surface px-2"
						>
							<span className="min-w-0 flex-1 truncate font-mono text-sm text-fg">
								{repo.owner}/{repo.repo}
							</span>
							<IconButton
								size="sm"
								label={`Remove ${repo.owner}/${repo.repo}`}
								icon={<Trash2 />}
								onClick={() => void remove(repo.owner, repo.repo)}
							/>
						</li>
					))}
				</ul>
			)}
			<form onSubmit={(event) => void add(event)} className="flex items-end gap-2">
				<Input
					label="Repository"
					placeholder="owner/repository"
					value={value}
					invalid={message !== null}
					className="font-mono"
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
		</SettingsSection>
	);
}
