// One line per distinct outcome, capped, so render paths can explain themselves on device
// without flooding the debugger.
const reported = new Set<string>();

export function report(line: string) {
	if (reported.has(line) || reported.size > 40) return;
	reported.add(line);
	console.log(`[DuoLayout] ${line}`);
}
