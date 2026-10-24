import { PixelRatio } from 'react-native';

import { adjustWindowClass, defaultPolicy, windowClassName, type Mode, type WindowClass } from '../../../../src/shared/columns.ts';
import { findLoaded, whenAllLoaded } from '../../../../src/shared/when-loaded.ts';
import type { Cleanup } from '../lifecycle.ts';
import { paths, settings } from '../modules.ts';
import { refreshLayout } from '../patches/dimensions-store.ts';
import { hasClassifierShape, patchWindowSizeClassifier } from '../patches/window-size-classifier.ts';

// Discord's own column decision, narrowed for Dynamic Type and the phone-only switch.
export function applyColumns(): Cleanup {
	return whenAllLoaded([paths.classifier, paths.baseDimensions], ([classifier, base]) => {
		if (!hasClassifierShape(classifier, base)) {
			console.warn('[DuoLayout] Discord layout modules changed shape; staying on stock columns.');
			return () => {};
		}

		const sidebar = findLoaded(paths.drawerWidth)?.DRAWER_LEFT_WIDTH_MIN;
		const policy = typeof sidebar === 'number' ? { ...defaultPolicy, sidebar } : defaultPolicy;
		let last = '';

		const decide = (stock: WindowClass, width: number) => {
			const fontScale = PixelRatio.getFontScale();
			const mode: Mode = settings.get('mode', 'auto') === 'phone' ? 'phone' : 'auto';
			const chosen = adjustWindowClass(stock, width, fontScale, mode, policy);
			const line = `width ${Math.round(width)} pt, text x${fontScale.toFixed(2)}: ${windowClassName[stock]} -> ${windowClassName[chosen]}`;
			if (line !== last) console.log(`[DuoLayout] ${(last = line)}`);
			return chosen;
		};

		const unpatch = patchWindowSizeClassifier(classifier, base, decide);
		const unlisten = settings.addListener((payload) => payload.store === 'duo.layout' && payload.key === 'mode', () => refreshLayout());
		if (!refreshLayout()) console.warn('[DuoLayout] Dimensions store not found; changes apply at the next resize.');

		return () => {
			unlisten();
			unpatch();
			refreshLayout();
		};
	});
}
