import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

export function NumericField({ id, value, integer, positive, required, onChange }: {
	id: string; value: unknown; integer: boolean; positive: boolean; required: boolean;
	onChange: (value: number | null) => void;
}) {
	const [text, setText] = useState(value == null ? "" : String(value));
	useEffect(() => setText(value == null ? "" : String(value)), [value]);
	return <Input className="min-h-11" id={id} type="number" min={positive ? 1 : undefined} step={integer ? 1 : "any"} inputMode={integer ? "numeric" : "decimal"} value={text} required={required}
		onChange={(event) => {
			const raw = event.target.value; setText(raw);
			const number = Number(raw);
			const empty = raw.trim() === "";
			const valid = empty ? !required : Number.isFinite(number) && (!integer || Number.isInteger(number)) && (!positive || number > 0);
			event.target.setCustomValidity(valid ? "" : positive ? "Enter a positive integer." : integer ? "Enter an integer." : "Enter a finite number.");
			if (valid) onChange(empty ? null : number);
		}} />;
}
