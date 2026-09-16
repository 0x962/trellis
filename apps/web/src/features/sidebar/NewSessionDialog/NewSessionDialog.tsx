import { ArrowUp, FolderOpen } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, IconButton, Kbd, Select, Tooltip, toast, useHotkey } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { type SessionHarness, sessionHarnesses } from "../../sessions/harnessLabel";

export type NewSessionDialogProps = {
	onClose: () => void;
};

// The composer behind the New session button, in the shape of the Superset
// one: an optional name on top, the prompt box with the harness pill and
// the round submit under the text, and the No project and Cmd+Enter hints
// at the bottom. The caller mounts it while it is open, so the Cmd+Enter
// hotkey lives only while it shows. A created session opens at once.
export function NewSessionDialog({ onClose }: NewSessionDialogProps) {
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
			onClose();
			await queryClient.invalidateQueries({ queryKey: orpc.sessions.key() });
			await navigate({ to: "/sessions/$id", params: { id: session.id } });
			if (session.run.state === "failed" || session.run.state === "interrupted")
				toast.error(`${session.name} could not start`, { description: session.run.error ?? undefined });
		},
	});
	const ready = prompt.trim() !== "" && !create.isPending;
	const submit = () => {
		if (ready) create.mutate();
	};
	useHotkey("mod+enter", submit);
	return (
		<Dialog
			open
			onOpenChange={(next) => {
				if (!next && !create.isPending) onClose();
			}}
			title="New session"
			size="lg"
			bare
			initialFocus={promptRef}
			className="gap-0 bg-surface p-0"
		>
			<form
				className="flex flex-col gap-3 p-4"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<input
					aria-label="Session name"
					autoComplete="off"
					maxLength={60}
					placeholder="Session name (optional)"
					disabled={create.isPending}
					value={name}
					onChange={(event) => setName(event.target.value)}
					className="h-7 w-full bg-transparent text-base font-medium text-fg outline-none placeholder:text-fg-faint"
				/>
				<div className="flex flex-col rounded-lg border border-border bg-elevated">
					<textarea
						ref={promptRef}
						aria-label="Prompt"
						maxLength={20000}
						placeholder="What do you want to do?"
						disabled={create.isPending}
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						className="max-h-60 min-h-20 w-full resize-none bg-transparent px-3 pt-3 text-base leading-5 text-fg outline-none placeholder:text-fg-faint [field-sizing:content]"
					/>
					<div className="flex items-center justify-between gap-2 px-2 pb-2">
						<Select
							label="Harness"
							items={sessionHarnesses}
							value={harness}
							onValueChange={setHarness}
							disabled={create.isPending}
						/>
						<Tooltip content="Create session">
							<IconButton
								variant="primary"
								size="sm"
								label="Create session"
								icon={<ArrowUp weight="bold" />}
								disabled={!ready}
								onClick={submit}
							/>
						</Tooltip>
					</div>
				</div>
				{create.isError && (
					<p role="alert" className="text-sm text-danger">
						{create.error.message}
					</p>
				)}
				<div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
					<span className="inline-flex items-center gap-1.5">
						<FolderOpen aria-hidden="true" className="size-3.5" />
						No project
					</span>
					<span className="inline-flex items-center gap-1">
						<Kbd>⌘↩</Kbd> to create
					</span>
				</div>
			</form>
		</Dialog>
	);
}
