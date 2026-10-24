import { bookSidebarWidth, tabletopMediaHeight } from '../../../../src/shared/posture.ts';
import { whenAllLoaded } from '../../../../src/shared/when-loaded.ts';
import type { Cleanup } from '../lifecycle.ts';
import { paths, Patcher, sensor } from '../modules.ts';
import { refreshLayout } from '../patches/dimensions-store.ts';

// Book posture: the tiled channel list ends at the far edge of the fold, so the chat sits
// wholly on the other half instead of running across the crease.
export function splitAtFold(): Cleanup {
	return whenAllLoaded([paths.drawerWidth, paths.chatLayout], ([drawer, chatLayout]) => {
		if (typeof drawer?.useDrawerWidth !== 'function' || typeof drawer?.getDrawerWidth !== 'function') {
			console.warn('[DuoLayout] drawer width module changed shape; book split off.');
			return () => {};
		}
		const minimum = Number(drawer.DRAWER_LEFT_WIDTH_MIN ?? 332);
		const width = () => {
			if (!chatLayout?.getChatLayout?.().isChatLockedOpen) return null;
			const { shape, posture } = sensor.current.get();
			return shape ? bookSidebarWidth(posture, shape.safeArea.left, minimum) : null;
		};
		const unpatches = [
			Patcher.after(drawer, 'useDrawerWidth', ({ result }) => width() ?? result),
			Patcher.after(drawer, 'getDrawerWidth', ({ result }) => width() ?? result),
		];
		refreshLayout();
		return () => {
			for (const unpatch of unpatches) unpatch();
			refreshLayout();
		};
	});
}

// Tabletop posture in a call: the video grid fills the half above the fold; Discord's
// controls stay on the half below, which is the stable base Apple describes.
export function tabletopCalls(): Cleanup {
	return whenAllLoaded([paths.voiceCardLayout], ([layout]) => {
		const prototype = layout?.default?.prototype;
		if (typeof prototype?.updateState !== 'function') {
			console.warn('[DuoLayout] call grid layout changed shape; tabletop calls off.');
			return () => {};
		}
		const unpatch = Patcher.before(prototype, 'updateState', ({ args }) => {
			const media = tabletopMediaHeight(sensor.current.get().posture, 200);
			const metrics = args[1] as { windowHeight?: number } | undefined;
			if (media && metrics && typeof metrics.windowHeight === 'number') args[1] = { ...metrics, windowHeight: Math.min(metrics.windowHeight, media) };
		});
		refreshLayout();
		return () => {
			unpatch();
			refreshLayout();
		};
	});
}
