import type { ProjectSummary } from "@trellis/api";
import { Command, type CommandItem, Popover } from "@trellis/ui";
import { type ReactElement, type RefObject, useRef, useState } from "react";
import { projectSlashPath } from "../../../lib/projectPath";

const byPosition = (a: ProjectSummary, b: ProjectSummary) => a.position - b.position;

// `archivedAt` reports only the project row. The server also refuses writes
// under an archived ancestor, so each archived path removes its full subtree.
export const selectableProjects = (
	projects: readonly ProjectSummary[],
	ticketRootIds?: readonly string[],
): ProjectSummary[] => {
	if (ticketRootIds !== undefined && ticketRootIds.length !== 1) return [];
	const rootId = ticketRootIds?.[0];
	const archivedPaths = projects.filter((project) => project.archivedAt !== null).map((project) => project.path);
	return projects.filter(
		(project) =>
			(rootId === undefined || project.rootId === rootId) &&
			!archivedPaths.some((path) => project.path === path || project.path.startsWith(`${path}.`)),
	);
};

// The projects in tree order: roots by position, then each root's subtree
// depth first. The option id is the dotted ref; the hint is the slash path.
export const projectItems = (projects: readonly ProjectSummary[], current?: string): CommandItem[] => {
	const children = new Map<string | null, ProjectSummary[]>();
	for (const project of projects) {
		const list = children.get(project.parentId) ?? [];
		list.push(project);
		children.set(project.parentId, list);
	}
	const items: CommandItem[] = [];
	const walk = (parentId: string | null, depth: number) => {
		for (const project of (children.get(parentId) ?? []).sort(byPosition)) {
			const path = projectSlashPath(project.path);
			items.push({
				id: project.path,
				label: depth === 0 ? project.key : project.name,
				keywords: [path, project.name, project.key],
				hint: path,
				depth,
				current: project.path === current,
			});
			walk(project.id, depth + 1);
		}
	};
	walk(null, 0);
	return items;
};

export type ProjectPickerProps = {
	projects: readonly ProjectSummary[];
	// A move is valid only when all selected tickets have one root. An empty
	// set shows no target. An omitted set permits all roots for ticket create.
	ticketRootIds?: readonly string[];
	// The current project path.
	value?: string;
	onPick: (path: string) => void;
	trigger: ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
	// The server's reason for refusing the last pick, shown under the list.
	error?: string | null;
	// When true, a pick leaves the picker open. The caller closes it after
	// the server accepts the move, so a refusal shows inside the picker.
	keepOpenOnPick?: boolean;
};

// The project popover: the tree by depth, searchable by path.
export function ProjectPicker({
	projects,
	ticketRootIds,
	value,
	onPick,
	trigger,
	open,
	onOpenChange,
	finalFocus,
	side,
	error,
	keepOpenOnPick = false,
}: ProjectPickerProps) {
	const [own, setOwn] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const isOpen = open ?? own;
	const setOpen = (next: boolean) => {
		setOwn(next);
		onOpenChange?.(next);
	};
	return (
		<Popover
			trigger={trigger}
			label="Project"
			open={isOpen}
			onOpenChange={setOpen}
			initialFocus={input}
			finalFocus={finalFocus}
			side={side}
			className="w-72 p-0"
		>
			<Command
				inputRef={input}
				label="Search projects"
				placeholder="Move to project"
				items={projectItems(selectableProjects(projects, ticketRootIds), value)}
				onSelect={(path) => {
					if (!keepOpenOnPick) setOpen(false);
					onPick(path);
				}}
			/>
			{error !== undefined && error !== null && (
				<p role="alert" className="m-1 rounded-sm bg-danger-soft px-2 py-1.5 text-sm text-danger">
					{error}
				</p>
			)}
		</Popover>
	);
}
