import { DotsThree, PushPinSimple, ShareNetwork } from "@phosphor-icons/react";
import { Spinner, useMediaQuery } from "@trellis/ui";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar, TopbarActionButton } from "../../../../shell/Topbar";

export function PageDetailLoading() {
	const phone = useMediaQuery("(max-width: 767px)");
	return (
		<>
			<Topbar
				actions={
					<>
						{!phone && <TopbarActionButton label="Pin Page" icon={<PushPinSimple />} disabled />}
						{!phone && <TopbarActionButton label="Share Page" icon={<ShareNetwork />} disabled />}
						<TopbarActionButton label="Page actions" icon={<DotsThree />} disabled />
					</>
				}
			>
				<PageTitle title="Page" />
			</Topbar>
			<div className="page-card flex flex-1 items-center justify-center overflow-hidden" role="status">
				<Spinner />
				<span className="sr-only">Load Page</span>
			</div>
		</>
	);
}
