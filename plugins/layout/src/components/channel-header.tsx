import React from 'react';
import { View } from 'react-native';

import { headerRow } from '../../../../src/shared/posture.ts';
import { settings } from '../modules.ts';
import { report } from '../report.ts';
import { editChannelHeader, outline, type Component } from '../patches/channel-header.tsx';
import { chatHeaderFrames } from './chat-header-frames.ts';
import { useView } from './status-strip.tsx';

const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

// Fills the header and reports its window frame whenever its layout changes.
function useMeasurer(): React.ReactNode {
	const owner = React.useRef({}).current;
	const ref = React.useRef<View>(null);
	React.useEffect(() => () => chatHeaderFrames.set(owner, null), [owner]);
	const onLayout = React.useCallback(() => {
		ref.current?.measureInWindow((x, y, width, height) => chatHeaderFrames.set(owner, width > 0 ? { x, y, width, height } : null));
	}, [owner]);
	return <View key='duo-header-frame' ref={ref} collapsable={false} pointerEvents='none' style={fill} onLayout={onLayout} />;
}

const wrappers = new WeakMap<Component, Component>();

// Discord's channel header renders inside this component, so the header can take the
// status bar's row and report where it sits while our hooks stay out of Discord's. Ours
// run first, Discord's after, in the same order every render. The row holds whether the
// chat peeks beside the channel list or is expanded: Discord switches those states only
// after its slide finishes, so a header that moved with them would visibly lag.
export function onStatusRow(Header: Component): Component {
	let Wrapped = wrappers.get(Header);
	if (Wrapped) return Wrapped;
	Wrapped = function DuoChannelHeader(props) {
		const view = useView();
		const band = settings.useSettingsStore().get('band', true);
		const measurer = useMeasurer();
		const tree = Header(props);
		const row = band && view.shape ? headerRow(view.shape) : null;
		const edited = editChannelHeader(tree, row, measurer, props.frame);
		if (edited === tree) report(`channel header signature not found: ${JSON.stringify(outline(tree)).slice(0, 700)}`);
		else if (row) report(`channel header on the status row (top ${row.top}, clear ${row.trailing})`);
		return edited;
	};
	wrappers.set(Header, Wrapped);
	return Wrapped;
}
