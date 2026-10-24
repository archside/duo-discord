// Live fold reading: window size plus every reserved region, read on demand.
// Run: npm run device -- eval --file tools/probes/fold.js
(function () {
	var objc = window.unbound.plugins.getEntity('duo.probe').context.native.objc;
	function ui(t, s, a) { return objc.invoke(t, s, a || [], { thread: 'main' }); }
	var scene = ui(ui(ui(objc.getClass('UIApplication'), 'sharedApplication'), 'connectedScenes'), 'allObjects')[0];
	var w = ui(scene, 'keyWindow');
	var kinds = objc.getClass('UIViewReservedRegionKind');
	var regions = ['division', 'occlusion'].map(function (kind) {
		return ui(w, 'reservedRegionsOfKind:options:', [ui(kinds, kind + 'RegionKind'), 1]).map(function (r) {
			var f = ui(r, 'frame').value;
			return kind + (ui(r, 'isActive') ? ' ACTIVE ' : ' idle ') + Math.round(f.origin.x) + ',' + Math.round(f.origin.y) + ' ' + Math.round(f.size.width) + 'x' + Math.round(f.size.height);
		});
	});
	var b = ui(w, 'bounds').value.size;
	return new Date().toISOString().slice(11, 19) + ' window ' + b.width + 'x' + b.height + ' | ' + [].concat(regions[0], regions[1]).join(' | ');
})()
