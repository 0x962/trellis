import type { AllowedEditorOperation } from "./editorGrant.ts";

export type EditorRoute = {
	method: "GET" | "PUT";
	path: string;
	operation: AllowedEditorOperation;
};

export const editorRoutes = [
	{ method: "GET", path: "/api/trellis-editor/v1/document", operation: "document:read" },
	{ method: "PUT", path: "/api/trellis-editor/v1/document", operation: "document:save" },
	{
		method: "GET",
		path: "/api/trellis-editor/v1/component-manifest",
		operation: "component-manifest:read",
	},
] as const satisfies readonly EditorRoute[];

export function operationForEditorRoute(method: string, path: string): AllowedEditorOperation | null {
	return editorRoutes.find((route) => route.method === method && route.path === path)?.operation ?? null;
}
