// First REPL step on the device: confirms the Discord module paths Duo Layout patches,
// including the iOS dimensions store, and shows what Discord decided for this window.
// Run: npm run device -- eval --file tools/probes/discover.js
(() => {
	const wanted = /DimensionsStore|useWindowSizeClassifier|useBaseAppContainerDimensions|useChatLayout|useDrawerWidth|SafeAreaStore/;
	const found = [];
	for (const [id, record] of window.modules) {
		const path = record?.__filePath;
		if (path && wanted.test(path)) found.push(`${id} ${path}`);
	}
	const layout = found.find((line) => line.endsWith('modules/chat/native/useChatLayout.tsx'));
	const chat = layout ? window.modules.get(Number(layout.split(' ')[0]))?.publicModule?.exports?.getChatLayout?.() : undefined;
	const { width, height, fontScale } = window.ReactNative.Dimensions.get('window');
	return JSON.stringify({ window: { width, height, fontScale }, chatLayout: chat ?? 'not loaded', modules: found }, null, 2);
})()
