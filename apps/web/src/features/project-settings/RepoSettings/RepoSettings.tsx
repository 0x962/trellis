import { Plus, Trash } from "@phosphor-icons/react";
import type { Project } from "@trellis/api";
import { Button, ConfirmDialog, FieldHint, FormStatus, GithubMark, IconButton, Input } from "@trellis/ui";
import { type FormEvent, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";

export type RepoSettingsProps = {
	project: Project;
};

export function RepoSettings({ project }: RepoSettingsProps) {
	const { client, queryClient } = useApp();
	const [value, setValue] = useState("");
	const [addMessage, setAddMessage] = useState<string | null>(null);
	const [removeTarget, setRemoveTarget] = useState<{ owner: string; repo: string } | null>(null);
	const [removeMessage, setRemoveMessage] = useState<string | null>(null);
	const [write, setWrite] = useState<"add" | "remove" | null>(null);
	const writing = useRef(false);
	const addButton = useRef<HTMLButtonElement>(null);
	const focusAddAfterRemove = useRef(false);

	const save = async (repos: { owner: string; repo: string }[], action: "add" | "remove") => {
		if (writing.current) return false;
		writing.current = true;
		setWrite(action);
		try {
			await client.projects.setRepos({ project: project.key, repos });
			await queryClient.invalidateQueries();
			return true;
		} catch (error) {
			const message = (error as Error).message;
			if (action === "add") setAddMessage(message);
			else setRemoveMessage(message);
			return false;
		} finally {
			writing.current = false;
			setWrite(null);
		}
	};

	const add = async (event: FormEvent) => {
		event.preventDefault();
		if (writing.current) return;
		setAddMessage(null);
		const match = /^(?:https:\/\/github\.com\/)?([a-z0-9_.-]+)\/([a-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
			value.trim().toLowerCase(),
		);
		if (match === null) {
			setAddMessage("Use a GitHub URL or owner/repository.");
			return;
		}
		const saved = await save(
			[...project.repos.map(({ owner, repo }) => ({ owner, repo })), { owner: match[1]!, repo: match[2]! }],
			"add",
		);
		if (saved) setValue("");
	};

	const openRemove = (owner: string, repo: string) => {
		if (writing.current) return;
		setRemoveMessage(null);
		focusAddAfterRemove.current = false;
		setRemoveTarget({ owner, repo });
	};

	const closeRemove = () => {
		if (writing.current) return;
		setRemoveMessage(null);
		focusAddAfterRemove.current = false;
		setRemoveTarget(null);
	};

	const remove = async () => {
		if (removeTarget === null || writing.current) return;
		setRemoveMessage(null);
		const saved = await save(
			project.repos
				.filter((entry) => entry.owner !== removeTarget.owner || entry.repo !== removeTarget.repo)
				.map(({ owner, repo }) => ({ owner, repo })),
			"remove",
		);
		if (saved) {
			focusAddAfterRemove.current = true;
			setRemoveTarget(null);
		}
	};

	return (
		<section className="project-settings-group">
			<div className="flex flex-col gap-1">
				<h3 className="project-settings-group-title">Repositories</h3>
				<FieldHint>Connect GitHub repositories to find pull requests that reference project tickets.</FieldHint>
			</div>
			{project.repos.length === 0 ? (
				<FieldHint>No repositories connected. Add a repository to link its pull requests to tickets.</FieldHint>
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
								disabled={write !== null}
								onClick={() => openRemove(repo.owner, repo.repo)}
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
					error={addMessage ?? undefined}
					disabled={write !== null}
					onChange={(event) => setValue(event.target.value)}
				/>
				<Button ref={addButton} type="submit" icon={<Plus />} disabled={write !== null} processing={write === "add"}>
					Add repository
				</Button>
			</form>
			<ConfirmDialog
				open={removeTarget !== null}
				title={removeTarget === null ? "Remove repository?" : `Remove ${removeTarget.owner}/${removeTarget.repo}?`}
				description="Removes this repository from the project. The repository stays on GitHub."
				confirmLabel="Remove repository"
				danger
				processing={write === "remove"}
				finalFocus={() => (focusAddAfterRemove.current ? addButton.current : true)}
				onConfirm={() => void remove()}
				onCancel={closeRemove}
			>
				{removeMessage !== null && <FormStatus status="error" message={removeMessage} />}
			</ConfirmDialog>
		</section>
	);
}
