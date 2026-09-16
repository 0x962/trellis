import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Input, Select, Sheet, Textarea, toast } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { type SessionHarness, sessionHarnesses } from "../../sessions/harnessLabel";

export type NewSessionDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

// The form behind the New session button: the prompt the agent starts
// from, an optional name, and the harness. A created session opens at
// once, so the person sees its terminal come up.
export function NewSessionDialog({ open, onOpenChange }: NewSessionDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const promptRef = useRef<HTMLTextAreaElement>(null);
	const [prompt, setPrompt] = useState("");
	const [name, setName] = useState("");
	const [harness, setHarness] = useState<SessionHarness>("claude");
	const create = useMutation({
		mutationFn: () =>
			client.sessions.create({
				prompt: prompt.trim(),
				...(name.trim() === "" ? {} : { name: name.trim() }),
				harness: { preset: harness },
			}),
		onSuccess: async (session) => {
			onOpenChange(false);
			setPrompt("");
			setName("");
			await queryClient.invalidateQueries({ queryKey: orpc.sessions.key() });
			await navigate({ to: "/sessions/$id", params: { id: session.id } });
			if (session.run.state === "failed" || session.run.state === "interrupted")
				toast.error(`${session.name} could not start`, { description: session.run.error ?? undefined });
		},
	});
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => !create.isPending && onOpenChange(next)}
			title="New session"
			titleClassName="text-md font-medium"
			initialFocus={promptRef}
		>
			<form
				className="flex min-h-full flex-col"
				onSubmit={(event) => {
					event.preventDefault();
					if (prompt.trim() && !create.isPending) create.mutate();
				}}
			>
				<div className="flex flex-1 flex-col gap-6 p-6 max-md:p-4">
					<p className="text-sm text-fg-muted">
						A session is a scratch repository with one agent, outside every project. The agent starts from the prompt.
					</p>
					<Textarea
						ref={promptRef}
						label="Prompt"
						required
						rows={6}
						maxLength={20000}
						disabled={create.isPending}
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
					/>
					<Input
						label="Name"
						placeholder="A generated name when empty"
						maxLength={60}
						disabled={create.isPending}
						value={name}
						onChange={(event) => setName(event.target.value)}
						className="pointer-coarse:h-11"
					/>
					<Select
						label="Harness"
						items={sessionHarnesses}
						value={harness}
						onValueChange={setHarness}
						disabled={create.isPending}
					/>
					{create.isError && (
						<p role="alert" className="text-sm text-danger">
							{create.error.message}
						</p>
					)}
				</div>
				<div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface p-4">
					<Button type="button" variant="quiet" disabled={create.isPending} onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={!prompt.trim() || create.isPending}>
						Create session
					</Button>
				</div>
			</form>
		</Sheet>
	);
}
