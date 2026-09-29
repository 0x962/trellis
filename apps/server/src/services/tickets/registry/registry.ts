import { core } from "../../registryEntry";
import * as tickets from "../../tickets.ts";

export const ticketServices = {
	"tickets.list": core("read", tickets.list),
	"tickets.counts": core("read", tickets.counts),
	"tickets.board": core("read", tickets.board),
	"tickets.get": core("read", tickets.get),
	"tickets.create": core("mutation", tickets.create),
	"tickets.update": core("mutation", tickets.update),
	"tickets.move": core("mutation", tickets.move),
	"tickets.updateMany": core("mutation", tickets.updateMany),
	"tickets.deleteMany": core("mutation", tickets.deleteMany),
	"tickets.delete": core("mutation", tickets.delete),
	"tickets.importContract": core("mutation", tickets.importContract),
	"tickets.importDependencies": core("mutation", tickets.importDependencies),
	"tickets.dependencies": core("read", tickets.dependencies),
	"tickets.updateDependencies": core("mutation", tickets.updateDependencies),
	"tickets.setContract": core("mutation", tickets.setContract),
	"tickets.setOutcome": core("mutation", tickets.setOutcome),
};
