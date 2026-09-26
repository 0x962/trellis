import { Trash } from "@phosphor-icons/react";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { GithubMark } from "../GithubMark";

export type RepositoryRowProps = {
	owner: string;
	repo: string;
	disabled?: boolean;
	onRemove: () => void;
};

export function RepositoryRow({ owner, repo, disabled, onRemove }: RepositoryRowProps) {
	return (
		<li className="flex min-h-8 items-center rounded-md border border-border bg-surface px-2">
			<a
				href={`https://github.com/${owner}/${repo}`}
				target="_blank"
				rel="noreferrer"
				className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-accent underline"
			>
				<GithubMark aria-hidden="true" className="size-3.5 shrink-0" />
				<span className="truncate">
					{owner}/{repo}
				</span>
			</a>
			<Tooltip content={`Remove ${owner}/${repo}`}>
				<IconButton label={`Remove ${owner}/${repo}`} icon={<Trash />} disabled={disabled} onClick={onRemove} />
			</Tooltip>
		</li>
	);
}
