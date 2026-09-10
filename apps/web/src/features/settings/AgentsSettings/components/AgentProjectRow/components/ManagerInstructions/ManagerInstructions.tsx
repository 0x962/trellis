import { useQuery } from "@tanstack/react-query";
import { type ProjectSummary, rolePrompt } from "@trellis/api";
import { Button, Dialog, ScrollArea, Skeleton } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { copyText } from "../../../../../../../lib/clipboard";

export type ManagerInstructionsProps = {
	// A root project. Its manager serves the root and every sub-project
	// under it.
	project: ProjectSummary;
};

// The manager of a project starts with the output of `trellis instructions
// --role manager --project <path>`, which builds the text from the prompt
// file and the status descriptions of that moment. This dialog builds the
// text from the same two inputs, so it shows what a start makes now. The
// statuses query waits for the open, so a settings page with many projects
// reads no statuses until a human asks for one.
export function ManagerInstructions({ project }: ManagerInstructionsProps) {
	const { orpc } = useApp();
	const [open, setOpen] = useState(false);
	const statuses = useQuery({
		...orpc.statuses.list.queryOptions({ input: { project: project.path } }),
		enabled: open,
	});
	const prompt =
		statuses.data === undefined
			? null
			: rolePrompt({ role: "manager", project: project.path, statuses: statuses.data.statuses });

	return (
		<>
			<Button variant="quiet" className="self-start" onClick={() => setOpen(true)}>
				Manager instructions
			</Button>
			<Dialog
				open={open}
				onOpenChange={setOpen}
				size="lg"
				title="Manager instructions"
				description="A manager started now receives this text. A running manager received the text of its own start."
			>
				<ScrollArea className="h-96 rounded-md border border-border bg-surface">
					{prompt === null ? (
						<Skeleton className="m-3" lines={14} />
					) : (
						<pre className="p-3 font-mono text-xs whitespace-pre-wrap text-fg">{prompt}</pre>
					)}
				</ScrollArea>
				<Button
					variant="default"
					disabled={prompt === null}
					className="self-end"
					onClick={() => void copyText(prompt!, "Copied the manager instructions")}
				>
					Copy
				</Button>
			</Dialog>
		</>
	);
}
