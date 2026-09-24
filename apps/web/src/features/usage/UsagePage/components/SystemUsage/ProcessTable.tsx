import type { SystemProcess } from "@trellis/api";
import { Button, DisplayPopover, EmptyState, FilterBar, Input, SectionHeader } from "@trellis/ui";
import { useMemo, useState } from "react";
import { formatBytes } from "../../../../../lib/format";
import { formatPercent, formatUptime } from "./formatSystemUsage";

type ProcessSort = "cpu" | "memory" | "name" | "pid" | "time";

const PAGE_SIZE = 100;

const sortFields = [
	{ value: "cpu", label: "CPU", descending: true },
	{ value: "memory", label: "Memory", descending: true },
	{ value: "name", label: "Name", descending: false },
	{ value: "pid", label: "PID", descending: false },
	{ value: "time", label: "Runtime", descending: true },
] as const;

const stateLabels: Record<string, string> = {
	D: "Waiting",
	I: "Idle",
	R: "Running",
	S: "Sleeping",
	T: "Stopped",
	U: "Blocked",
	Z: "Zombie",
};

const compare = (field: ProcessSort, left: SystemProcess, right: SystemProcess) => {
	if (field === "name") return left.command.localeCompare(right.command);
	if (field === "pid") return left.pid - right.pid;
	if (field === "memory") return left.memoryBytes - right.memoryBytes;
	if (field === "time") return left.elapsedSeconds - right.elapsedSeconds;
	return left.cpuPercent - right.cpuPercent;
};

export function ProcessTable({ processes }: { processes: readonly SystemProcess[] }) {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<ProcessSort>("cpu");
	const [descending, setDescending] = useState(true);
	const [shown, setShown] = useState(PAGE_SIZE);
	const visible = useMemo(() => {
		const term = query.trim().toLocaleLowerCase();
		return processes
			.filter(
				(process) =>
					term === "" ||
					process.command.toLocaleLowerCase().includes(term) ||
					process.user.toLocaleLowerCase().includes(term) ||
					String(process.pid).includes(term),
			)
			.toSorted((left, right) => compare(sort, left, right) * (descending ? -1 : 1));
	}, [descending, processes, query, sort]);

	return (
		<section aria-label="Processes" className="flex flex-col gap-3">
			<SectionHeader
				title="Processes"
				count={visible.length}
				actions={
					<FilterBar>
						<Input
							label="Search processes"
							hideLabel
							value={query}
							placeholder="Search processes"
							className="w-56 max-sm:w-44"
							onChange={(event) => {
								setQuery(event.target.value);
								setShown(PAGE_SIZE);
							}}
						/>
						<DisplayPopover
							fields={sortFields}
							field={sort}
							descending={descending}
							onSortChange={(field, nextDescending) => {
								setSort(field as ProcessSort);
								setDescending(nextDescending);
								setShown(PAGE_SIZE);
							}}
						/>
					</FilterBar>
				}
			/>
			{visible.length === 0 ? (
				<EmptyState
					title="No matching processes"
					description={`No process matches '${query.trim()}'. Clear the search to show all processes.`}
				/>
			) : (
				<div className="overflow-x-auto">
					<table aria-label="Processes" className="w-full table-fixed border-collapse text-sm">
						<thead>
							<tr className="border-b border-border text-left text-xs text-fg-faint">
								<th scope="col" className="h-8 pr-3 font-medium">
									Process
								</th>
								<th scope="col" className="h-8 w-20 pr-6 text-right font-medium max-sm:hidden">
									PID
								</th>
								<th scope="col" className="h-8 w-32 pr-3 font-medium max-lg:hidden">
									User
								</th>
								<th scope="col" className="h-8 w-24 pr-3 font-medium max-xl:hidden">
									State
								</th>
								<th scope="col" className="h-8 w-20 pr-3 text-right font-medium">
									CPU
								</th>
								<th scope="col" className="h-8 w-24 pr-3 text-right font-medium">
									Memory
								</th>
								<th scope="col" className="h-8 w-24 text-right font-medium max-md:hidden">
									Runtime
								</th>
							</tr>
						</thead>
						<tbody>
							{visible.slice(0, shown).map((process) => (
								<tr
									key={process.pid}
									className="h-9 border-b border-border transition-colors duration-hover ease-out hover:bg-band"
								>
									<td className="truncate pr-3 font-mono text-fg" title={process.command}>
										{process.command}
									</td>
									<td className="pr-6 text-right text-fg-muted tabular max-sm:hidden">{process.pid}</td>
									<td className="truncate pr-3 text-fg-muted max-lg:hidden">{process.user}</td>
									<td className="pr-3 text-fg-muted max-xl:hidden">{stateLabels[process.state] ?? process.state}</td>
									<td className="pr-3 text-right text-fg tabular">{formatPercent(process.cpuPercent)}</td>
									<td className="pr-3 text-right text-fg tabular">
										{formatBytes(process.memoryBytes)}
										<span className="ml-1.5 text-xs text-fg-faint tabular">{formatPercent(process.memoryPercent)}</span>
									</td>
									<td className="text-right text-fg-muted tabular max-md:hidden">
										{formatUptime(process.elapsedSeconds)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{visible.length > shown && (
						<div className="flex justify-start pt-3">
							<Button size="sm" variant="quiet" onClick={() => setShown((count) => count + PAGE_SIZE)}>
								Show {Math.min(PAGE_SIZE, visible.length - shown)} more of {visible.length}
							</Button>
						</div>
					)}
				</div>
			)}
		</section>
	);
}
