import { PageSheet } from "../../../../shell/PageSheet";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar } from "../../../../shell/Topbar";

export type ImageSheetProps = {
	name: string;
	url: string;
	onClose: () => void;
};

export function ImageSheet({ name, url, onClose }: ImageSheetProps) {
	return (
		<PageSheet open onClose={onClose} title={name}>
			<Topbar>
				<PageTitle title={name} />
			</Topbar>
			<div className="min-h-0 flex-1 bg-pane">
				<img src={url} alt={name} className="h-full w-full object-contain" />
			</div>
		</PageSheet>
	);
}
