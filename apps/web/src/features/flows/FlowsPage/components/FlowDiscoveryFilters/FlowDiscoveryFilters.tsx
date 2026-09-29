import { FunnelSimple } from "@phosphor-icons/react";
import { Chip, FilterBar, FilterPopover, IconButton, Input, Tooltip } from "@trellis/ui";
import { useState } from "react";
import type { FlowDiscoveryFilters as Filters } from "../../flowDiscovery";

export type FlowDiscoveryFiltersProps = {
	filters: Filters;
	projects: { key: string; name: string }[];
	onChange: (filters: Filters) => void;
};

export function FlowDiscoveryFilters({ filters, projects, onChange }: FlowDiscoveryFiltersProps) {
	const [open, setOpen] = useState(false);
	return (
		<FilterBar
			filters={
				filters.project !== null && (
					<Chip
						label="Project"
						value={filters.project}
						onValueClick={() => setOpen(true)}
						onRemove={() => onChange({ ...filters, project: null })}
						removeLabel="Remove project filter"
					/>
				)
			}
		>
			<Input
				type="search"
				label="Search flows"
				hideLabel
				placeholder="Search flows…"
				value={filters.query}
				onChange={(event) => onChange({ ...filters, query: event.target.value })}
				className="w-48 max-md:w-32"
			/>
			<FilterPopover
				trigger={
					<Tooltip content="Filter flows">
						<IconButton label="Filter flows" icon={<FunnelSimple />} />
					</Tooltip>
				}
				open={open}
				onOpenChange={setOpen}
				label="Search projects"
				placeholder="Project"
				items={[
					{ id: "all", label: "All projects" },
					...projects.map((project) => ({ id: project.key, label: project.name })),
				]}
				onSelect={(key) => {
					onChange({ ...filters, project: key === "all" ? null : key });
					setOpen(false);
				}}
			/>
		</FilterBar>
	);
}
