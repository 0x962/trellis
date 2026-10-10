import { useQuery } from "@tanstack/react-query";
import type { ProjectSummary } from "@trellis/api";
import { Command, type CommandItem, Popover } from "@trellis/ui";
import { type AriaAttributes, cloneElement, type ReactElement, type RefObject, useRef, useState } from "react";

import { useApp } from "../../../lib/appContext";
import { CreateProjectDialog } from "../../project-actions/CreateProjectDialog";
import { createNameItem } from "../utils/createNameItem";

const byPosition = (a: ProjectSummary, b: ProjectSummary) => a.position - b.position;

// An archived project takes no write, so the picker leaves it out.
export const selectableProjects = (projects: readonly ProjectSummary[]): ProjectSummary[] =>
	projects.filter((project) => project.archivedAt === null);

// The projects in display order. The option id is the project key, and the
// hint is its name.
export const projectItems = (projects: readonly ProjectSummary[], current?: string): CommandItem[] =>
	[...projects].sort(byPosition).map((project) => ({
		id: project.key,
		label: project.key,
		keywords: [project.key, project.slug, project.name],
		hint: project.name,
		current: project.key === current,
	}));

export type ProjectPickerProps = AriaAttributes & {
	id?: string;
	scope?: string;
	includeArchived?: boolean;
	noProjectLabel?: string;
	projects: readonly ProjectSummary[];
	// The key of the current project.
	value?: string;
	onPick: (key: string) => void;
	trigger: ReactElement<AriaAttributes & { id?: string; disabled?: boolean }>;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
	// The server's reason for refusing the last pick, shown under the list.
	error?: string | null;
	// When true, a pick leaves the picker open. The caller closes it after
	// the server accepts the move, so a refusal shows inside the picker.
	keepOpenOnPick?: boolean;
	allowNoProject?: boolean;
	disabled?: boolean;
};

// The project popover: every project, searchable by key, slug, and name.
export function ProjectPicker({
	projects,
	scope,
	value,
	onPick,
	trigger,
	open,
	onOpenChange,
	finalFocus,
	side,
	error,
	keepOpenOnPick = false,
	allowNoProject = false,
	disabled = false,
	includeArchived = false,
	noProjectLabel = "No project",
	...controlProps
}: ProjectPickerProps) {
	const { orpc } = useApp();
	const [search, setSearch] = useState("");
	const [createName, setCreateName] = useState<{ name: string; scope: string | undefined } | null>(null);
	const [own, setOwn] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const isOpen = open ?? own;
	const activeCreateName = createName?.scope === scope ? (createName?.name ?? null) : null;
	const allProjects = useQuery({ ...orpc.projects.list.queryOptions({ input: {} }), enabled: isOpen });
	const setOpen = (next: boolean) => {
		setSearch("");
		setOwn(next);
		onOpenChange?.(next);
	};
	const createItem = allProjects.isSuccess
		? createNameItem("project", search, [
				...allProjects.data.flatMap((project) => [project.name, project.key, project.slug]),
				...(allowNoProject ? [noProjectLabel] : []),
			])
		: null;
	return (
		<>
			<Popover
				trigger={cloneElement(trigger, { ...controlProps, disabled: disabled || trigger.props.disabled })}
				label="Project"
				open={isOpen && !disabled && activeCreateName === null}
				onOpenChange={setOpen}
				initialFocus={input}
				finalFocus={finalFocus}
				side={side}
				className="w-72 p-0"
			>
				<Command
					inputRef={input}
					onSearchChange={setSearch}
					label="Search projects"
					placeholder="Move to project"
					items={[
						...(allowNoProject ? [{ id: "no-project", label: noProjectLabel, current: !value }] : []),
						...projectItems(includeArchived ? projects : selectableProjects(projects), value),
						...(createItem ? [createItem] : []),
					]}
					onSelect={(key) => {
						if (key === createItem?.id) {
							setCreateName({ name: search.trim(), scope });
							return;
						}
						if (!keepOpenOnPick) setOpen(false);
						onPick(key === "no-project" ? "" : key);
					}}
				/>
				{error !== undefined && error !== null && (
					<p role="alert" className="m-1 rounded-sm bg-danger-soft px-2 py-1.5 text-sm text-danger">
						{error}
					</p>
				)}
			</Popover>
			{activeCreateName !== null && (
				<CreateProjectDialog
					initialName={activeCreateName}
					scope={scope}
					onClose={() => setCreateName(null)}
					onCreated={(project) => {
						setCreateName(null);
						if (!keepOpenOnPick) setOpen(false);
						onPick(project.key);
					}}
				/>
			)}
		</>
	);
}
