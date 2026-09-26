import { FieldHint } from "../FieldHint";

export type FormStatusProps = {
	state: "idle" | "saving" | "saved" | "error";
	message?: string;
	className?: string;
};

const messages = { idle: "", saving: "Saving…", saved: "Saved.", error: "The save failed." };

export function FormStatus({ state, message, className }: FormStatusProps) {
	return (
		<FieldHint
			className={className}
			role={state === "error" ? "alert" : "status"}
			tone={state === "error" ? "danger" : "default"}
		>
			{message ?? messages[state]}
		</FieldHint>
	);
}
