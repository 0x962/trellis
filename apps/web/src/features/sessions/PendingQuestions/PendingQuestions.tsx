import { ChatCircleDots } from "@phosphor-icons/react";
import type { AgentRun } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { QuestionForm } from "./components/QuestionForm";

export function PendingQuestions({ run, readOnly }: { run: AgentRun; readOnly: boolean }) {
	const [open, setOpen] = useState<string | null>(null);
	const requests =
		run.processStatus === "running" && run.observation?.controllable
			? (run.observation?.attention?.requests ?? [])
			: [];
	if (!requests.length) return null;
	return (
		<div className="flex shrink-0 flex-col gap-1 border-b border-border px-3 py-2">
			{requests.map((request) => (
				<div key={request.id} className="flex items-center gap-2">
					<p className="min-w-0 flex-1 text-sm text-fg" role="status">
						{request.title}
					</p>
					{request.questions && (
						<>
							<Tooltip content="Answer question">
								<IconButton
									label="Answer question"
									icon={<ChatCircleDots />}
									disabled={readOnly}
									onClick={() => setOpen(request.id)}
								/>
							</Tooltip>
							<QuestionForm
								key={`${run.terminalId}:${request.id}`}
								run={run}
								request={request}
								open={open === request.id}
								onOpenChange={(value) => setOpen(value ? request.id : null)}
							/>
						</>
					)}
				</div>
			))}
		</div>
	);
}
