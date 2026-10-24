// Discord's own inputs to its column decision, read from its stores, plus plugin state.
// Run: npm run device -- eval --file tools/probes/layout-state.js
(function () {
	function exp(path) {
		for (var entry of window.modules) {
			if (entry[1] && entry[1].__filePath === path) return entry[1].publicModule && entry[1].publicModule.exports;
		}
	}
	var safe = exp('modules/safe_area/SafeAreaStore.native.tsx');
	var dims = exp('modules/screen/native/DimensionsStore.ios.tsx');
	var base = exp('modules/screen/native/useBaseAppContainerDimensions.tsx');
	var classifier = exp('modules/screen/native/useWindowSizeClassifier.tsx');
	var chat = exp('modules/chat/native/useChatLayout.tsx');
	var pick = function (store, field) {
		var state = store && store.default && store.default.getState && store.default.getState();
		var out = {};
		Object.keys((state && state.byAppEntry) || {}).forEach(function (k) { out[k] = state.byAppEntry[k][field]; });
		return out;
	};
	var plugin = window.unbound.plugins.getEntity('duo.layout');
	return JSON.stringify({
		rnWindow: window.ReactNative.Dimensions.get('window'),
		safeAreaStore: pick(safe, 'safeAreaInsets'),
		windowDimensionsStore: pick(dims, 'windowDimensions'),
		baseWidth: base && base.getBaseAppContainerDimensions(),
		windowClass: classifier && classifier.getWindowSizeClassifier(),
		chatLayout: chat && chat.getChatLayout(),
		duoLayout: plugin ? { started: plugin.started, failed: plugin.failed } : 'not installed',
	}, null, 1);
})()
