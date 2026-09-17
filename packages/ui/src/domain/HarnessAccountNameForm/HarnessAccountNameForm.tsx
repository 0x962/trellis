import { useState } from "react";
import { Button } from "../../primitives/Button";
import { Dialog } from "../../primitives/Dialog";
import { Input } from "../../primitives/Input";

export function HarnessAccountNameForm({
	open,
	name: initialName,
	busy,
	error,
	onClose,
	onSubmit,
}: {
	open: boolean;
	name: string;
	busy: boolean;
	error?: string;
	onClose: () => void;
	onSubmit: (name: string) => void;
}) {
	const [name, setName] = useState(initialName);
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => !next && !busy && onClose()}
			title="Rename account"
			description="Choose the account name that Trellis shows."
		>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					onSubmit(name.trim());
				}}
			>
				<Input
					label="Account name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					required
					maxLength={120}
					autoFocus
				/>
				{error && (
					<p role="alert" className="text-sm text-danger">
						{error}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button disabled={busy} onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" processing={busy} disabled={!name.trim()}>
						Rename account
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
