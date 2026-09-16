import { Badge } from "../../primitives/Badge";
import { EmptyState } from "../../primitives/EmptyState";

type Check = {
	name: string;
	workflow?: string | null;
	bucket: "pass" | "fail" | "pending" | "skipping" | "cancel";
	link: string | null;
};
type Group = { id: string; title: string; error: string | null; checks: Check[] };
const labels = { pass: "Passed", fail: "Failed", pending: "Pending", skipping: "Skipped", cancel: "Canceled" };

export function CheckResults({ groups }: { groups: Group[] }) {
	if (groups.length === 0)
		return (
			<EmptyState
				title="No pull request checks"
				description="Link a pull request to see its reported checks. Terminal activity does not count as a passed check."
			/>
		);
	return (
		<div className="flex flex-col gap-6">
			{groups.map((group) => (
				<section key={group.id} aria-label={group.title} className="flex flex-col gap-2">
					<h3 className="text-sm font-medium">{group.title}</h3>
					{group.error && (
						<p role="alert" className="text-sm text-danger">
							The last read failed. {group.error}
						</p>
					)}
					{group.checks.length === 0 ? (
						<EmptyState
							title="No checks reported"
							description="GitHub has not reported checks for this pull request."
						/>
					) : (
						<ul className="flex flex-col gap-2">
							{group.checks.map((check) => (
								<li
									key={`${check.workflow ?? ""}-${check.name}-${check.link ?? ""}`}
									className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
								>
									{check.link ? (
										<a
											href={check.link}
											target="_blank"
											rel="noreferrer"
											className="min-w-0 break-words underline decoration-border-strong underline-offset-2"
										>
											{check.name}
										</a>
									) : (
										<span className="min-w-0 break-words">{check.name}</span>
									)}
									<Badge
										tone={
											check.bucket === "pass"
												? "ok"
												: check.bucket === "fail" || check.bucket === "cancel"
													? "bad"
													: "neutral"
										}
									>
										{labels[check.bucket]}
									</Badge>
								</li>
							))}
						</ul>
					)}
				</section>
			))}
		</div>
	);
}
