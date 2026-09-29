import type { UploadError } from "../../hooks/useUploads";

export const uploadErrorText = (filename: string, error: UploadError): string => {
	if (error.code === "PROJECT_ARCHIVED") return `${filename} is not attached. The project is archived.`;
	return `${filename} is not attached. The upload failed.`;
};
