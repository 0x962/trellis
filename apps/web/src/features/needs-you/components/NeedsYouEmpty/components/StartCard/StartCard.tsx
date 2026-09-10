import { Link } from "@tanstack/react-router";
import { Button, IconButton } from "@trellis/ui";
import { ArrowRight, X } from "lucide-react";
import { composerActions } from "../../../../../composer";
import { CliLine } from "../../../../../shell/CliLine";

export type StartCardProps = {
	// The key of the first root project, for the CLI line.
	projectKey: string;
	onDismiss: () => void;
};

// The first steps of a home with no ticket: create one here, create one from
// a terminal, or set up the agents.
export function StartCard({ projectKey, onDismiss }: StartCardProps) {
	return (
		<section
			aria-label="Start"
			className="relative flex w-120 max-w-full flex-col items-start gap-3 rounded-lg border border-border bg-surface p-4 text-left"
		>
			{/* IconButton sets its own position for its hit area, so a wrapper holds the corner. */}
			<span className="absolute top-2 right-2">
				<IconButton variant="quiet" label="Dismiss" icon={<X />} onClick={onDismiss} />
			</span>
			<Button variant="primary" size="md" kbd="c" onClick={() => composerActions.open({ project: projectKey })}>
				Create a ticket
			</Button>
			<CliLine command={`trellis new -p ${projectKey} "Ticket title"`} />
			<Link
				to="/settings"
				hash="agents"
				className="inline-flex items-center gap-1.5 text-sm text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
			>
				Set up agents
				<ArrowRight aria-hidden="true" className="size-3" />
			</Link>
		</section>
	);
}
