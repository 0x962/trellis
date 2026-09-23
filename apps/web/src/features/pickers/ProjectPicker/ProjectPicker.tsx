import type { ProjectSummary } from "@trellis/api";
import { Command, type CommandItem, Popover } from "@trellis/ui";
import { type ReactElement, type RefObject, useRef, useState } from "react";

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

export type ProjectPickerProps = {
	projects: readonly ProjectSummary[];
	// The key of the current project.
	value?: string;
	onPick: (key: string) => void;
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

// The project popover: every project, searchable by key, slug, and name.
export function ProjectPicker({
	projects,
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
				items={projectItems(selectableProjects(projects), value)}
				onSelect={(key) => {
					if (!keepOpenOnPick) setOpen(false);
					onPick(key);
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
