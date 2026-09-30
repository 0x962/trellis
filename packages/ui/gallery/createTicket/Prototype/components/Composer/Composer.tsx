import { CaretRight, Paperclip, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button, ConfirmDialog, FailureState, IconButton, Switch, Tooltip, TrellisMark } from "../../../ui";
import { DialogFrame } from "../DialogFrame";
import { TicketFields } from "../TicketFields";
import type { ComposerState } from "../useComposer";

export function Composer({
	open,
	onClose,
	opener,
	state,
	embedded,
}: {
	open: boolean;
	onClose: () => void;
	opener: React.RefObject<HTMLButtonElement | null>;
	state: ComposerState;
	embedded: boolean;
}) {
	const [discard, setDiscard] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const retry = state.phase === "failed";
	function requestClose() {
		if (state.processing || retry) return;
		onClose();
	}
	return (
		<>
			<DialogFrame
				embedded={embedded}
				open={open}
				onOpenChange={(next) => !next && requestClose()}
				title="Create ticket"
				size="lg"
				bare
				initialFocus={state.titleRef}
				finalFocus={opener}
				className="ticket-composer"
			>
				<form
					noValidate
					onSubmit={(event) => {
						event.preventDefault();
						void state.submit();
					}}
					onKeyDown={(event) => {
						if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
							event.preventDefault();
							void state.submit();
						}
					}}
				>
					<header className="composer-header">
						<div className="composer-heading">
							<span className="composer-project">
								<TrellisMark className="size-4" />
								Trellis
							</span>
							<CaretRight size={12} aria-hidden="true" />
							<span>New ticket</span>
						</div>
						<Tooltip content="Close and keep draft">
							<IconButton
								label="Close and keep draft"
								icon={<X />}
								onClick={requestClose}
								disabled={state.processing || retry}
							/>
						</Tooltip>
					</header>
					<div className="composer-body">
						<TicketFields state={state} onDiscard={() => setDiscard(true)} />
					</div>
					{retry && (
						<div className="assignment-error" role="alert">
							<FailureState
								title="The ticket exists. The agent cannot start."
								description="Your ticket and its content are safe. Retry the assignment or keep the ticket unassigned."
							/>
						</div>
					)}
					{state.receipt && (
						<p className="inline-receipt" role="status">
							{state.receipt}
						</p>
					)}
					<footer className="composer-footer">
						<div className="footer-options">
							<input
								ref={fileInput}
								type="file"
								multiple
								hidden
								onChange={(event) => {
									state.setFiles([
										...state.files,
										...Array.from(event.target.files ?? [], (file) => ({ id: crypto.randomUUID(), name: file.name })),
									]);
									event.target.value = "";
								}}
							/>
							<Tooltip content="Attach files">
								<IconButton
									label="Attach files"
									icon={<Paperclip />}
									onClick={() => fileInput.current?.click()}
									disabled={state.locked}
								/>
							</Tooltip>
						</div>
						<div className="submit-actions">
							{!retry && (
								<Switch
									label="Create another"
									checked={state.keepOpen}
									onCheckedChange={state.setKeepOpen}
									disabled={state.locked}
									className="create-another"
								/>
							)}
							{retry && <Button onClick={() => state.finish(false)}>Keep unassigned</Button>}
							<Tooltip content="Create ticket · ⌘ Enter">
								<Button
									variant="primary"
									size="md"
									disabled={!state.title.trim()}
									type="button"
									onClick={() => void state.submit()}
									processing={state.processing}
									className="create-action"
								>
									{state.phase === "creating"
										? "Creating…"
										: state.phase === "assigning"
											? "Assigning…"
											: retry
												? "Retry assignment"
												: state.agent === "none"
													? "Create ticket"
													: "Create and assign"}
								</Button>
							</Tooltip>
						</div>
					</footer>
				</form>
			</DialogFrame>
			<ConfirmDialog
				open={discard}
				title="Discard this draft?"
				description="This removes the title, description, and attachments from this draft."
				confirmLabel="Discard draft"
				danger
				onCancel={() => setDiscard(false)}
				onConfirm={() => {
					state.clearDraft();
					setDiscard(false);
					onClose();
				}}
			/>
		</>
	);
}
