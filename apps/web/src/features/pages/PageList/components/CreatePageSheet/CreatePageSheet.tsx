import { Chats, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, ChoiceBoxes, Sheet, SheetBody, SheetFooter, Textarea, toast } from "@trellis/ui";
import { useMemo, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { sessionComposerActions } from "../../../../sessions/sessionComposerStore";
import { createPagePrompt } from "./createPagePrompt";

const newSession = "new";

export function CreatePageSheet({
	projectId,
	projectKey,
	onClose,
}: {
	projectId: string;
	projectKey: string;
	onClose: () => void;
}) {
	const { client, orpc } = useApp();
	const promptRef = useRef<HTMLTextAreaElement>(null);
	const [target, setTarget] = useState(newSession);
	const [request, setRequest] = useState("");
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { project: projectId, assigned: true, limit: 1000 } }),
		select: (rows) => rows.filter((run) => run.kind !== "flow"),
	});
	const options = useMemo(
		() => [
			...(runs.data ?? []).map((run) => ({ value: run.id, label: run.name, icon: <Chats /> })),
			{ value: newSession, label: "New project session", icon: <Plus /> },
		],
		[runs.data],
	);
	const send = useMutation({
		mutationFn: (text: string) => client.agentRuns.send({ id: target, text }),
		onSuccess: () => {
			toast.success("The Page request was sent");
			onClose();
		},
	});
	const submit = () => {
		const text = createPagePrompt(projectKey, request);
		if (target === newSession) {
			sessionComposerActions.change({ project: projectKey, name: "Create a Page", prompt: text });
			onClose();
			sessionComposerActions.open(projectKey);
			return;
		}
		send.mutate(text);
	};

	return (
		<Sheet
			open
			title="Create Page"
			width={560}
			initialFocus={promptRef}
			titleClassName="text-md font-medium"
			onOpenChange={(open) => !open && !send.isPending && onClose()}
		>
			<form
				className="flex min-h-full flex-col"
				onSubmit={(event) => {
					event.preventDefault();
					if (request.trim() !== "" && !send.isPending) submit();
				}}
			>
				<SheetBody>
					<Textarea
						ref={promptRef}
						label="What must the Page show?"
						required
						rows={8}
						maxLength={10000}
						disabled={send.isPending}
						value={request}
						onChange={(event) => setRequest(event.target.value)}
						placeholder="Describe the artifact, its audience, and the facts it must show."
					/>
					<div className="flex flex-col gap-1">
						<p className="text-sm text-fg-muted">Agent</p>
						<ChoiceBoxes
							label="Agent"
							options={options}
							value={target}
							onValueChange={setTarget}
							disabled={send.isPending}
							className="flex-wrap [&>*]:basis-32"
						/>
						<p className="text-xs text-fg-faint">Choose an assigned agent, or prepare a new project session.</p>
					</div>
					{runs.isPending && (
						<p role="status" className="text-sm text-fg-muted">
							Load assigned agents…
						</p>
					)}
					{runs.isError && (
						<p role="alert" className="text-sm text-danger">
							The assigned agents did not load. {runs.error.message}
						</p>
					)}
					{send.isError && (
						<p role="alert" className="text-sm text-danger">
							The Page request was not sent. {send.error.message}
						</p>
					)}
				</SheetBody>
				<SheetFooter>
					<Button type="button" variant="quiet" disabled={send.isPending} onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={request.trim() === "" || send.isPending}>
						{target === newSession ? "Continue" : "Send request"}
					</Button>
				</SheetFooter>
			</form>
		</Sheet>
	);
}
