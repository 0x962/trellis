import type { ReactNode } from "react";

export type ProviderFormValue = {
	name: string;
	kind: "vercel-ai-gateway" | "openai-compatible";
	baseUrl: string;
	apiKey: string;
	models: string[];
	enabled: boolean;
};

export type ProviderFieldsProps = {
	value: ProviderFormValue;
	onChange: (value: ProviderFormValue) => void;
	editing?: boolean;
	keyLast4?: string;
	busy: boolean;
	valid: boolean;
	error?: string;
	errorField?: string;
	models: (id: string) => ReactNode;
	onClose: () => void;
	onSubmit: () => void;
};
