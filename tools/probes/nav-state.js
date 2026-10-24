// Summarises Discord's navigation state and column decision, IDs shortened to 4 digits.
// Run: npm run device -- eval --file tools/probes/nav-state.js
(function () {
	function exp(path) {
		for (var entry of window.modules) if (entry[1] && entry[1].__filePath === path) return entry[1].publicModule && entry[1].publicModule.exports;
	}
	var short = function (id) { return id == null ? id : '…' + String(id).slice(-4); };
	var ref = exp('modules/main_tabs_v2/RootNavigationRef.native.tsx');
	var nav = ref && ref.getRootNavigationRef && ref.getRootNavigationRef();
	function walk(state, depth) {
		if (!state || !state.routes || depth > 5) return undefined;
		return state.routes.map(function (r, i) {
			var p = r.params || {};
			var tag = (i === state.index ? '*' : '') + r.name;
			var bits = [];
			if (p.guildId) bits.push('g' + short(p.guildId));
			if (p.channelId) bits.push('c' + short(p.channelId));
			if (p.drawerOpen != null) bits.push('drawer=' + p.drawerOpen);
			var kids = walk(r.state, depth + 1);
			return tag + (bits.length ? '(' + bits.join(' ') + ')' : '') + (kids ? '[' + kids.join(', ') + ']' : '');
		});
	}
	var focused = exp('modules/panels/isChannelFocused.native.tsx');
	var chat = exp('modules/chat/native/useChatLayout.tsx');
	var w = window.ReactNative.Dimensions.get('window');
	return JSON.stringify({
		window: w.width + 'x' + w.height,
		layout: chat && chat.getChatLayout(),
		focusedChannel: focused && short(focused.getFocusedChannelId()),
		routes: nav && nav.isReady() ? walk(nav.getRootState(), 0) : 'navigation not ready',
	});
})()
