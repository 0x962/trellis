import { core, io, prepared } from "../../registryEntry";
import * as pageContent from "../content.ts";
import * as pages from "../pages.ts";
import { preparePublish, publish } from "../publish.ts";
import { purgeExpiredPages } from "../retention";
import * as pageUploads from "../uploads.ts";

export const pageServices = {
	"pages.retention": io("mutation", purgeExpiredPages),
	"pages.list": core("read", pages.list),
	"pages.upload": prepared("mutation", pageUploads.prepareUpload, pageUploads.upload),
	"pages.get": core("read", pages.get),
	"pages.publish": prepared("mutation", preparePublish, publish),
	"pages.versions": core("read", pageContent.versions),
	"pages.pull": core("read", pageContent.pull),
	"pages.versionFile": core("read", pageContent.versionFile),
	"pages.update": core("mutation", pages.update),
	"pages.pin": core("mutation", pages.pin),
	"pages.delete": core("mutation", pages.remove),
	"pages.restore": core("mutation", pages.restore),
};
