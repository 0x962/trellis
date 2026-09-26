import { Plus } from "@phosphor-icons/react";
import { IconButton, Input, RepositoryRow, Tooltip } from "@trellis/ui";
import { useRef, useState } from "react";

import type { Repo } from "../generalValues";

export type RepoSettingsProps = {
	repos: Repo[];
	disabled: boolean;
	onChange: (repos: Repo[]) => void;
	onBlur: () => void;
	onDraftChange: (dirty: boolean) => void;
	onError: (error: string | null) => void;
};

export function RepoSettings({ repos, disabled, onChange, onBlur, onDraftChange, onError }: RepoSettingsProps) {
	const currentRepos = useRef(repos);
	currentRepos.current = repos;
	const changeRepos = (next: Repo[]) => {
		currentRepos.current = next;
		onChange(next);
	};
	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | null>(null);
	const addButton = useRef<HTMLButtonElement>(null);
	const addRepo = () => {
		if (disabled || draft.trim() === "") return;
		const match = /^(?:https:\/\/github\.com\/)?([a-z0-9_.-]+)\/([a-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
			draft.trim().toLowerCase(),
		);
		if (match === null) {
			const message = "Use a GitHub URL or owner/repository.";
			setError(message);
			onError(message);
			return;
		}
		const entry = { owner: match[1]!, repo: match[2]! };
		if (!currentRepos.current.some((repo) => repo.owner === entry.owner && repo.repo === entry.repo))
			changeRepos([...currentRepos.current, entry]);
		setDraft("");
		setError(null);
		onError(null);
		onDraftChange(false);
	};
	return (
		<fieldset
			aria-label="Repositories"
			disabled={disabled}
			className="flex min-w-0 flex-col gap-2"
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) {
					addRepo();
					onBlur();
				}
			}}
		>
			<Input
				label="Repositories"
				placeholder="https://github.com/owner/repository"
				value={draft}
				hint="Connect GitHub repositories to find pull requests for project tickets."
				error={error ?? undefined}
				disabled={disabled}
				onChange={(event) => {
					setDraft(event.target.value);
					setError(null);
					onError(null);
					onDraftChange(event.target.value !== "");
				}}
				onBlur={(event) => {
					if (event.relatedTarget !== addButton.current) addRepo();
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						addRepo();
					}
				}}
				trailingAction={
					<Tooltip content="Add repository">
						<IconButton
							ref={addButton}
							label="Add repository"
							icon={<Plus />}
							disabled={disabled || draft.trim() === ""}
							onClick={addRepo}
						/>
					</Tooltip>
				}
			/>
			{repos.length > 0 && (
				<ul aria-label="Connected repositories" className="flex flex-col gap-1">
					{repos.map((repo) => (
						<RepositoryRow
							key={`${repo.owner}/${repo.repo}`}
							owner={repo.owner}
							repo={repo.repo}
							disabled={disabled}
							onRemove={() =>
								changeRepos(
									currentRepos.current.filter((entry) => entry.owner !== repo.owner || entry.repo !== repo.repo),
								)
							}
						/>
					))}
				</ul>
			)}
		</fieldset>
	);
}
