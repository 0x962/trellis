import { useRef, useState } from "react";
import { Button } from "../../primitives/Button";
import { Input } from "../../primitives/Input";
import { Sheet } from "../../primitives/Sheet";
import { SheetBody } from "../../primitives/SheetBody";

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
	const nameRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState(initialName);
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => !next && !busy && onClose()}
			title="Rename account"
			initialFocus={nameRef}
			titleClassName="text-md font-medium"
		>
			<SheetBody>
				<p className="text-sm text-fg-muted">Choose the account name that Trellis shows.</p>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						onSubmit(name.trim());
					}}
				>
					<Input
						ref={nameRef}
						label="Account name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						required
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
			</SheetBody>
		</Sheet>
	);
}
