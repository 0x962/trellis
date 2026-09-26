import { core, io, prepared } from "../../registryEntry";
import { backfillSearchText, prepareSearchBackfill } from "../backfillSearchText.ts";
import {
	createPageComment,
	deleteComment,
	editPageComment,
	listPageComments,
	replyToPageComment,
	setPageCommentResolved,
} from "../comments";
import * as pageContent from "../content.ts";
import { finishWatchDispatch, prepareWatchDispatch } from "../dispatchWatches";
import * as pages from "../pages.ts";
import { preparePublish, publish } from "../publish.ts";
import { purgeExpiredPages } from "../retention";
import * as pageUploads from "../uploads.ts";
import { watcherOptions } from "../watcherOptions";
import { watch } from "../watches";

export const pageServices = {
	"pages.watcherOptions": core("read", watcherOptions),
	"pages.watch": core("mutation", watch),
	"pages.dispatchWatches": prepared("mutation", prepareWatchDispatch, finishWatchDispatch),
	"pages.backfillSearch": prepared("mutation", prepareSearchBackfill, backfillSearchText),
	"pages.retention": io("mutation", purgeExpiredPages),
	"pages.list": core("read", pages.list),
	"pages.comments": core("read", listPageComments),
	"pages.comment": core("mutation", createPageComment),
	"pages.commentReply": core("mutation", replyToPageComment),
	"pages.commentResolve": core("mutation", setPageCommentResolved),
	"pages.commentEdit": core("mutation", editPageComment),
	"pages.commentDelete": core("mutation", deleteComment),
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
