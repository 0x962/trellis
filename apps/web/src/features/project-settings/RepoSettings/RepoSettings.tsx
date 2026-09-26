import { Plus, Trash } from "@phosphor-icons/react";
import { GithubMark, IconButton, Input, Tooltip } from "@trellis/ui";
import { useRef, useState } from "react";

type Repo = { owner: string; repo: string };
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
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const addButton = useRef<HTMLButtonElement>(null);
	const add = () => {
		if (disabled || value.trim() === "") return;
		const match = /^(?:https:\/\/github\.com\/)?([a-z0-9_.-]+)\/([a-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
			value.trim().toLowerCase(),
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
		setValue("");
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
					add();
					onBlur();
				}
			}}
		>
			<Input
				label="Repositories"
				placeholder="https://github.com/owner/repository"
				value={value}
				hint="Connect GitHub repositories to find pull requests for project tickets."
				error={error ?? undefined}
				disabled={disabled}
				onChange={(event) => {
					setValue(event.target.value);
					setError(null);
					onError(null);
					onDraftChange(event.target.value !== "");
				}}
				onBlur={(event) => {
					if (event.relatedTarget !== addButton.current) add();
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						add();
					}
				}}
				trailingAction={
					<Tooltip content="Add repository">
						<IconButton
							ref={addButton}
							label="Add repository"
							icon={<Plus />}
							disabled={disabled || value.trim() === ""}
							onClick={add}
						/>
					</Tooltip>
				}
			/>
			{repos.length > 0 && (
				<ul aria-label="Connected repositories" className="flex flex-col gap-1">
					{repos.map((repo) => (
						<li
							key={`${repo.owner}/${repo.repo}`}
							className="flex min-h-8 items-center rounded-md border border-border bg-surface px-2"
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
							<Tooltip content={`Remove ${repo.owner}/${repo.repo}`}>
								<IconButton
									label={`Remove ${repo.owner}/${repo.repo}`}
									icon={<Trash />}
									disabled={disabled}
									onClick={() =>
										changeRepos(
											currentRepos.current.filter((entry) => entry.owner !== repo.owner || entry.repo !== repo.repo),
										)
									}
								/>
							</Tooltip>
						</li>
					))}
				</ul>
			)}
		</fieldset>
	);
}
