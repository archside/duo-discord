import React from 'react';

import { comfortableTop, toolbar } from '../../../../src/shared/posture.ts';
import { findLoaded, whenAllLoaded } from '../../../../src/shared/when-loaded.ts';
import { onStatusRow } from '../components/channel-header.tsx';
import { ColumnLift, StatusStrip, YouBarGate } from '../components/status-strip.tsx';
import { enabled, type Cleanup } from '../lifecycle.ts';
import { paths, Patcher, sensor, settings } from '../modules.ts';
import { outline, wrapChannelHeader } from '../patches/channel-header.tsx';
import { refreshLayout } from '../patches/dimensions-store.ts';

type Insets = { top: number; right: number; bottom: number; left: number };

const pillShown = () => {
	const shape = sensor.current.get().shape;
	return enabled('rail', true) && Boolean(shape && toolbar(shape));
};

// Puts the system's reserved bands to work. The side band gets Discord's background and a
// floating pill with the YouBar's destinations; the YouBar hides while the pill shows; in a
// portrait top band the server list and the channel header share the status bar's row;
// and content keeps a comfortable top edge when the status bar moved to the side. Our components read their own switches, so
// flipping one updates in place without touching Discord's tree.
export function applyStatusStrip(): Cleanup {
	const removeHeader = applyChannelHeaderRow();
	const removeStrip = whenAllLoaded(
		[paths.mainTabs, paths.youBar, paths.youBarTotalHeight, paths.safeAreaInsets, paths.guilds],
		([mainTabs, youBar, youBarHeight, safeArea, guilds]) => {
			const unpatches: (() => void)[] = [];
			const shapeChanged = (name: string) => console.warn(`[DuoLayout] ${name} changed shape; that part of the status strip is off.`);

			if (typeof mainTabs?.default?.type === 'function') {
				unpatches.push(
					Patcher.after(mainTabs.default, 'type', ({ result }) => {
						if (!result?.props) return result;
						// Discord's children keep their positions, so React keeps them mounted.
						const children = result.props.children;
						const own = <StatusStrip key='duo-status-strip' />;
						return Array.isArray(children) ? React.cloneElement(result, {}, ...children, own) : React.cloneElement(result, {}, children, own);
					}),
				);
			} else shapeChanged('MainTabs');

			if (typeof youBar?.default?.type === 'function') {
				unpatches.push(Patcher.after(youBar.default, 'type', ({ result }) => (result ? <YouBarGate>{result}</YouBarGate> : result)));
			} else shapeChanged('YouBar');

			if (typeof youBarHeight?.useYouBarTotalHeight === 'function') {
				const barHeight = () => Number(findLoaded(paths.youBarConstants)?.YOU_BAR_HEIGHT ?? 56);
				unpatches.push(
					Patcher.after(youBarHeight, 'useYouBarTotalHeight', ({ result }) =>
						pillShown() && typeof result === 'number' ? Math.max(0, result - barHeight()) : result,
					),
				);
			}

			if (typeof guilds?.default?.type === 'function') {
				unpatches.push(Patcher.after(guilds.default, 'type', ({ result }) => (result ? <ColumnLift>{result}</ColumnLift> : result)));
			} else shapeChanged('Guilds');

			// The hook only: its getter feeds Discord's window-size maths, which must stay exact.
			if (typeof safeArea?.default === 'function') {
				const cache = new Map<string, Insets>();
				unpatches.push(
					Patcher.after(safeArea, 'default', ({ result }) => {
						const insets = result as Insets | undefined;
						if (!insets || !enabled('band', true)) return insets;
						const top = comfortableTop(sensor.current.get().shape, insets.top);
						if (top === insets.top) return insets;
						const key = `${top}|${insets.right}|${insets.bottom}|${insets.left}`;
						if (!cache.has(key)) cache.set(key, { ...insets, top });
						return cache.get(key);
					}),
				);
			}

			const unlisten = settings.addListener((payload) => payload.store === 'duo.layout' && (payload.key === 'rail' || payload.key === 'band'), () => refreshLayout());
			refreshLayout();

			return () => {
				unlisten();
				for (const unpatch of unpatches) unpatch();
				refreshLayout();
			};
		},
	);
	return () => {
		removeStrip();
		removeHeader();
	};
}

// The channel screen loads when a conversation first opens, so it is patched on its own.
function applyChannelHeaderRow(): Cleanup {
	return whenAllLoaded([paths.channelScreen], ([screen]) => {
		if (typeof screen?.default?.type !== 'function') {
			console.warn('[DuoLayout] channel screen changed shape; its header keeps the stock position.');
			return () => {};
		}
		let missing = false;
		const unpatch = Patcher.after(screen.default, 'type', ({ result }) => {
			const wrapped = wrapChannelHeader(result, onStatusRow);
			if (wrapped === result && !missing) {
				missing = true;
				console.warn(`[DuoLayout] channel header component not found; it keeps the stock position: ${JSON.stringify(outline(result)).slice(0, 700)}`);
			}
			return wrapped;
		});
		refreshLayout();
		return () => {
			unpatch();
			refreshLayout();
		};
	});
}
