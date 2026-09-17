import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { Upload } from "../hooks/useUploads";
import { UploadProgress } from "./UploadProgress";

const upload = (overrides: Partial<Upload>): Upload => ({
	id: "upload-1",
	file: new File(["body"], "brief.txt", { type: "text/plain" }),
	percent: 0,
	status: "uploading",
	error: null,
	...overrides,
});

describe("features/attachments/UploadProgress", () => {
	test("offers a retry for a failed network upload", () => {
		let retried: string | undefined;
		render(
			<UploadProgress
				upload={upload({ error: { code: "UPLOAD_FAILED" } })}
				onDismiss={() => {}}
				onRetry={(id) => {
					retried = id;
				}}
			/>,
		);
		screen.getByRole("button", { name: "Retry" }).click();
		expect(retried).toBe("upload-1");
	});

	test("offers no retry when the project is archived", () => {
		render(
			<UploadProgress
				upload={upload({ error: { code: "PROJECT_ARCHIVED" } })}
				onDismiss={() => {}}
				onRetry={() => {}}
			/>,
		);
		expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
		expect(screen.getByRole("alert").querySelector("span")!.textContent).toBe(
			"brief.txt is not attached. The project is archived.",
		);
	});
});
