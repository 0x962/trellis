import { hostRequest } from "../../hostRequest/hostRequest.ts";

type RequestDetails = {
	url: string;
	resourceType: string;
	webContentsId?: number;
	initiatorOrigin?: string;
};

export const authorizedHostRequest = (details: RequestDetails, windowId: number, hostOrigin: string): boolean => {
	if (!hostRequest(details.url, hostOrigin)) return false;
	if (details.webContentsId === windowId) return true;
	return (
		details.webContentsId === undefined && details.resourceType === "image" && details.initiatorOrigin === hostOrigin
	);
};
