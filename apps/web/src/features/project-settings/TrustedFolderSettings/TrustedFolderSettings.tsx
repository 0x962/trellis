import { folderPathPattern, type Project } from "@trellis/api";
import { Button, IconButton, Input } from "@trellis/ui";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { SettingsSection } from "../SettingsSection";

export type TrustedFolderSettingsProps = {
	project: Project;
};

// The folders trellis may mark as trusted for the agents of this project.
// Claude asks about an unknown folder and waits, so an agent in a folder
// no entry covers never runs. A folder inside an entry inherits the
// trust, and so does a git worktree of a repository an entry names.
export function TrustedFolderSettings({ project }: TrustedFolderSettingsProps) {
	const { client, queryClient } = useApp();
	const [value, setValue] = useState("");
	const [message, setMessage] = useState<string | null>(null);

	const save = async (paths: string[]) => {
		try {
			await client.projects.setTrustedFolders({ project: project.path, paths });
			setMessage(null);
			await queryClient.invalidateQueries();
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	const add = async (event: FormEvent) => {
		event.preventDefault();
		const path = value.trim();
		if (!folderPathPattern.test(path)) {
			setMessage("Give the absolute path of a folder, with no slash at the end.");
			return;
		}
		await save([...project.trustedFolders.map((folder) => folder.path), path]);
		setValue("");
	};

	const remove = (path: string) =>
		save(project.trustedFolders.filter((folder) => folder.path !== path).map((folder) => folder.path));

	return (
		<SettingsSection
			title="Trusted folders"
			hint="trellis marks these folders trusted before it starts an agent, so the agent skips the folder question."
		>
			{project.trustedFolders.length === 0 ? (
				<p className="text-sm text-fg-muted">No trusted folders. Agents of this project wait at the folder question.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{project.trustedFolders.map((folder) => (
						<li key={folder.path} className="flex h-8 items-center rounded-md border border-border bg-surface px-2">
							<span className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{folder.path}</span>
							<IconButton
								size="sm"
								label={`Remove ${folder.path}`}
								icon={<Trash2 />}
								onClick={() => void remove(folder.path)}
							/>
						</li>
					))}
				</ul>
			)}
			<form onSubmit={(event) => void add(event)} className="flex items-end gap-2">
				<Input
					label="Folder"
					placeholder="/Users/you/projects/trellis"
					value={value}
					invalid={message !== null}
					className="font-mono"
					onChange={(event) => setValue(event.target.value)}
				/>
				<Button type="submit" icon={<Plus />}>
					Add folder
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
