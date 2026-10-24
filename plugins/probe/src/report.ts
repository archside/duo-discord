import type { Environment } from '../../../src/shared/geometry-store.ts';
import type { NativeSnapshot } from '../../../src/shared/native-geometry.ts';
import type { BundleFacts } from './bundle-facts.ts';

export type ProbeEvent = { at: string; cause: string; environment: Environment; native?: NativeSnapshot | null; keyboard?: unknown; discord?: unknown };

export const report: { bundle?: BundleFacts; events: ProbeEvent[]; bridge?: string } = { events: [] };
