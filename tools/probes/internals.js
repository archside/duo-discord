// Confirms the Discord modules the next Duo Layout features patch exist on this build,
// with the export shapes the plugin expects. Reads only module metadata.
// Run: npm run device -- eval --file tools/probes/internals.js
(function () {
	var paths = [
		'modules/main_tabs_v2/native/MainTabs.tsx',
		'modules/main_tabs_v2/native/panels/MainTabsNavigatorPanel.tsx',
		'modules/main_tabs_v2/native/you_bar/YouBar.tsx',
		'modules/main_tabs_v2/native/you_bar/YouBarConstants.tsx',
		'modules/main_tabs_v2/native/you_bar/hooks/useYouBarTotalHeight.tsx',
		'modules/main_tabs_v2/native/tabs/guilds/Guilds.tsx',
		'modules/main_tabs_v2/native/MainTabsConstants.tsx',
		'modules/main_tabs_v2/native/panels/PanelsNavigationUtils.tsx',
		'modules/main_tabs_v2/native/panels/useChannelScreensFromNavigation.tsx',
		'modules/main_tabs_v2/native/navigateToLastChannel.tsx',
		'modules/main_tabs_v2/helpers/NavigationRouteUtils.native.tsx',
		'modules/panels/isChannelFocused.native.tsx',
		'modules/routing/transitionToGuild.native.tsx',
		'modules/routing/transitionToChannel.tsx',
		'modules/user_settings/core/native/openUserSettings.tsx',
		'modules/main_tabs_v2/native/tabs/you/utils/showYouAccountActionSheet.tsx',
		'modules/voice_panel/native/VoicePanelUI.tsx',
		'modules/voice_panel/native/card/VoicePanelCardLayoutManager.tsx',
		'modules/voice_panel/native/controls/VoicePanelControls.tsx',
		'modules/screen/native/drawer/useDrawerWidth.tsx',
		'modules/chat/native/useChatWidth.tsx',
	];
	var found = {};
	var byPath = {};
	for (var entry of window.modules) {
		var p = entry[1] && entry[1].__filePath;
		if (p) byPath[p] = entry[1];
	}
	var suffix = function (want) {
		for (var p in byPath) if (p === want || p.endsWith(want.replace(/^modules\//, ''))) return p;
	};
	paths.forEach(function (want) {
		var path = byPath[want] ? want : suffix(want);
		var record = path && byPath[path];
		if (!record) return (found[want] = 'not loaded');
		var exp = record.publicModule && record.publicModule.exports;
		var d = exp && exp.default;
		found[want] = {
			at: path === want ? undefined : path,
			exports: exp ? Object.keys(exp) : [],
			default: d == null ? null : typeof d === 'function' ? 'function' + (d.prototype && d.prototype.updateState ? ' (class with updateState)' : '') : d.$$typeof ? 'memo/forwardRef, type ' + typeof d.type : typeof d,
		};
	});
	var rootRef = Object.keys(byPath).filter(function (p) { return /RootNavigationRef/.test(p); });
	return JSON.stringify({ found: found, rootNavigationRefModules: rootRef }, null, 1);
})()
