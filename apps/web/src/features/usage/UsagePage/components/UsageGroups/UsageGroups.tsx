import { Link } from "@tanstack/react-router";
import type { UsageGroupBy, UsageGroupRow, UsageMetric } from "@trellis/api";
import { cx, SectionHeader, Segmented } from "@trellis/ui";
import { formatMetric, formatShare } from "../../../formatUsage";

const groupOptions = [
	{ value: "ticket", label: "Ticket" },
	{ value: "persona", label: "Persona" },
	{ value: "project", label: "Project" },
	{ value: "kind", label: "Kind" },
	{ value: "account", label: "Account" },
	{ value: "model", label: "Model" },
	{ value: "harness", label: "Harness" },
] as const;

export type UsageGroupsProps = {
	group: UsageGroupBy;
	rows: readonly UsageGroupRow[];
	metric: UsageMetric;
	total: number;
	selectedRow: string | null;
	onGroupChange: (group: UsageGroupBy) => void;
	onSelectRow: (key: string | null) => void;
};

// The link of a row: a ticket opens its page, a project opens its board.
function RowLink({ href, children }: { href: string; children: string }) {
	const className = "truncate text-fg-muted hover:text-fg hover:underline";
	if (href.startsWith("/t/")) {
		return (
			<Link to="/t/$identifier" params={{ identifier: href.slice(3) }} className={className}>
				{children}
			</Link>
		);
	}
	return (
		<Link to="/p/$" params={{ _splat: href.slice(3) }} className={className}>
			{children}
		</Link>
	);
}

// The range sliced one way at a time. The row with the largest share is
// first, and its bar is the full width. A pressed row is the selected
// slice: the chart and the session list above and below follow it.
export function UsageGroups({ group, rows, metric, total, selectedRow, onGroupChange, onSelectRow }: UsageGroupsProps) {
	const max = rows[0]?.[metric] ?? 0;
	return (
		<section aria-label="Breakdown" className="flex flex-col gap-3">
			<SectionHeader
				title="Breakdown"
				count={rows.length}
				actions={<Segmented label="Group by" options={groupOptions} value={group} onValueChange={onGroupChange} />}
			/>
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr className="border-b border-border text-left text-xs text-fg-faint">
						<th scope="col" className="h-8 pr-3 font-medium">
							{groupOptions.find((option) => option.value === group)?.label}
						</th>
						<th scope="col" className="h-8 pr-3 font-medium max-md:hidden" />
						<th scope="col" className="h-8 w-20 pr-3 text-right font-medium">
							Sessions
						</th>
						<th scope="col" className="h-8 w-16 pr-3 text-right font-medium max-md:hidden">
							Runs
						</th>
						<th scope="col" className="h-8 w-24 pr-3 text-right font-medium">
							{metric === "usd" ? "Cost" : "Tokens"}
						</th>
						<th scope="col" className="h-8 w-14 pr-3 text-right font-medium">
							Share
						</th>
						<th scope="col" className="h-8 w-40 font-medium max-sm:hidden">
							<span className="sr-only">Bar</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const selected = row.key === selectedRow;
						const value = row[metric];
						return (
							<tr
								key={row.key}
								aria-selected={selected}
								className={cx("border-b border-border", selected ? "bg-accent-soft" : "hover:bg-elevated")}
							>
								<td className="max-w-0 py-1.5 pr-3">
									<button
										type="button"
										aria-pressed={selected}
										onClick={() => onSelectRow(selected ? null : row.key)}
										className="block max-w-full truncate text-left font-medium text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
									>
										{row.label}
									</button>
								</td>
								<td className="max-w-0 py-1.5 pr-3 text-fg-muted max-md:hidden">
									{row.detail === null ? null : row.href ? (
										<RowLink href={row.href}>{row.detail}</RowLink>
									) : (
										<span className="block truncate">{row.detail}</span>
									)}
								</td>
								<td className="py-1.5 pr-3 text-right text-fg-muted tabular">{row.sessions.toLocaleString("en-US")}</td>
								<td className="py-1.5 pr-3 text-right text-fg-muted tabular max-md:hidden">
									{row.runs > 0 ? row.runs.toLocaleString("en-US") : ""}
								</td>
								<td className="py-1.5 pr-3 text-right text-fg tabular">
									{row.approximate && metric === "usd" ? "~" : ""}
									{formatMetric(metric, value)}
								</td>
								<td className="py-1.5 pr-3 text-right text-fg-muted tabular">{formatShare(value, total)}</td>
								<td className="py-1.5 max-sm:hidden">
									<div aria-hidden="true" className="h-2 w-full rounded-hairline bg-elevated">
										<div
											className="h-2 rounded-hairline bg-accent"
											style={{ width: `${max > 0 ? Math.max(1, Math.round((100 * value) / max)) : 0}%` }}
										/>
									</div>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</section>
	);
}
