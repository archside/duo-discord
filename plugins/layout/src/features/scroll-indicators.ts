import React from 'react';
import { ScrollView } from 'react-native';

import type { Cleanup } from '../lifecycle.ts';
import { enabled } from '../lifecycle.ts';
import { Patcher, sensor } from '../modules.ts';

type Insets = { top?: number; left?: number; bottom?: number; right?: number };
type Element = { type?: { prototype?: { render?: unknown } }; props?: Record<string, unknown> } | null;

// React Native's exported ScrollView is a plain function that only forwards to its inner
// class, so the class is reached through the element that function returns.
function innerScrollView() {
	try {
		const element = (ScrollView as unknown as (props: object) => Element)({});
		const prototype = element?.type?.prototype;
		return typeof prototype?.render === 'function' ? prototype : null;
	} catch {
		return null;
	}
}

// Beside the side band, vertical scroll indicators sit one band's width inside the list.
// Keeps them on the list's own trailing edge. Read at render, so the band switch and
// posture changes apply the next time a list renders.
export function applyScrollIndicators(): Cleanup {
	const prototype = innerScrollView();
	if (!prototype) {
		console.warn('[DuoLayout] ScrollView changed shape; scroll indicators stay stock.');
		return () => {};
	}
	console.log('[DuoLayout] scroll indicator fix on');
	return Patcher.after(prototype as never, 'render' as never, (({ result }: { result: Element }) => {
		const props = result?.props;
		if (!props || props.horizontal === true || !enabled('band', true)) return result;
		if (!(Number(sensor.current.get().shape?.safeArea.right) > 0)) return result;
		const insets = (props.scrollIndicatorInsets ?? {}) as Insets;
		return React.cloneElement(result as never, {
			automaticallyAdjustsScrollIndicatorInsets: false,
			scrollIndicatorInsets: { ...insets, right: 0 },
		} as never);
	}) as never) as unknown as Cleanup;
}
