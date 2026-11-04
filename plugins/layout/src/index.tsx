import React from 'react';
import type { PluginContext } from '@unbound-app/api/native';

import { SettingsPanel } from './components/settings-panel.tsx';
import { applyColumns } from './features/columns.ts';
import { keepConversationOnFold } from './features/continuity.ts';
import { releasePortraitLock } from './features/orientation.ts';
import { splitAtFold, tabletopCalls } from './features/postures.ts';
import { applyScrollIndicators } from './features/scroll-indicators.ts';
import { applyStatusStrip } from './features/status-strip.tsx';
import { applyAll, whileSetting } from './lifecycle.ts';
import { sensor } from './modules.ts';
import { createShapeSensor, flatSensor, sensorCapabilities } from './native/shape-sensor.ts';
import { batchRefresh, refreshLayout } from './patches/dimensions-store.ts';

let dispose = () => {};

function start(context?: PluginContext) {
	const native = context?.native;
	const capable = Boolean(native) && sensorCapabilities.every((capability) => native!.capabilities.includes(capability));
	sensor.current = capable ? createShapeSensor(native!) : flatSensor;
	if (!capable) console.warn('[DuoLayout] native bridge unavailable; fold-aware features stay off.');

	batchRefresh(() => {
		dispose = applyAll('DuoLayout', [
		() => sensor.current.dispose,
		() => sensor.current.subscribe(() => refreshLayout()),
		applyColumns,
		releasePortraitLock,
		() => whileSetting('continuity', true, keepConversationOnFold),
		applyStatusStrip,
		applyScrollIndicators,
		() => whileSetting('book', true, splitAtFold),
		() => whileSetting('tabletop', true, tabletopCalls),
		]);
	});
}

function stop() {
	batchRefresh(dispose);
	dispose = () => {};
	sensor.current = flatSensor;
}

export default { start, stop, getSettingsPanel: () => <SettingsPanel /> };
