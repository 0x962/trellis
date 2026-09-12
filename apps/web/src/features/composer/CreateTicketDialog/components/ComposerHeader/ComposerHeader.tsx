import { X } from "@phosphor-icons/react";
import { IconButton } from "@trellis/ui";
import { projectSlashPath } from "../../../../../lib/projectPath";
import { ProjectKey } from "../../../../shell/ProjectKey";

export type ComposerHeaderProps = {
	// The chosen project ref, `CDE.web`. Undefined before a choice on /all.
	project: string | undefined;
	onClose: () => void;
};

// The top row of the New ticket dialog: where the ticket goes, then the
// dialog name, then a close button. The dialog keeps "New ticket" as its
// accessible name.
export function ComposerHeader({ project, onClose }: ComposerHeaderProps) {
	const [key, ...rest] = project === undefined ? [] : projectSlashPath(project).split("/");
	return (
		<div data-composer-header="" className="flex h-7 items-center gap-2">
			{key !== undefined && (
				<span className="inline-flex h-5 items-center gap-1.5">
					<ProjectKey projectKey={key} />
					{rest.length > 0 && <span className="font-mono text-sm text-fg-muted">{rest.join("/")}</span>}
				</span>
			)}
			{key !== undefined && (
				<span aria-hidden="true" className="text-fg-faint">
					›
				</span>
			)}
			<span className="text-sm text-fg-muted">New ticket</span>
			<IconButton variant="quiet" size="sm" label="Close" icon={<X />} onClick={onClose} className="ml-auto" />
		</div>
	);
}
