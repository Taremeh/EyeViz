export type CoordinateSystem = 'pixels' | 'normalized';

export interface FixationRecord {
	x: number; // x coordinate in pixels or normalized [0,1]
	y: number; // y coordinate in pixels or normalized [0,1]
	startMs: number; // start time in milliseconds
	durationMs: number; // duration in milliseconds
	radiusPx?: number; // optional radius for rendering in pixels
	id?: string;
	color?: string;
	opacity?: number;
	// Keep any additional data for consumers
	[key: string]: unknown;
}

export type IAType = 'rect' | 'polygon' | 'circle';

export interface IARecordBase {
	id?: string;
	label?: string;
	color?: string;
	opacity?: number;
	startMs?: number;
	endMs?: number;
}

export interface IARect extends IARecordBase {
	type: 'rect';
	rect: { x: number; y: number; width: number; height: number };
}

export interface IAPolygon extends IARecordBase {
	type: 'polygon';
	polygon: Array<{ x: number; y: number }>;
}

export interface IACircle extends IARecordBase {
	type: 'circle';
	circle: { cx: number; cy: number; r: number };
}

export type IARecord = IARect | IAPolygon | IACircle;

export interface FixationColumnMap {
	x?: string;
	y?: string;
	startMs?: string; // ms column
	startSec?: string; // seconds column (as alternative)
	durationMs?: string; // ms column
	durationSec?: string; // seconds column (as alternative)
	endMs?: string; // optional end timestamp column (ms)
	radiusPx?: string;
	color?: string;
	opacity?: string;
	id?: string;
}

export interface IAColumnMap {
	// For rects
	x?: string;
	y?: string;
	width?: string;
	height?: string;
	// For circles
	cx?: string;
	cy?: string;
	r?: string;
	// For polygons
	points?: string; // string like "x1,y1; x2,y2; ..."
	// Generic metadata
	id?: string;
	label?: string;
	color?: string;
	opacity?: string;
	// Alternatively, caller can fully control mapping via iaRowToShape callback
}

export interface EyeVizProps {
	videoSrc: string | File | Blob;
	fixationSource: string | File | Blob | FixationRecord[];
	iaSource?: string | File | Blob | IARecord[];
	coordinateSystem?: CoordinateSystem;
	timestampUnit?: 'ms' | 's';
	iaTimestampUnit?: 'ms' | 's' | 'us';
	videoStartOffsetMs?: number;
	iaTimeOffsetMs?: number;
	fixationSurfaceSize?: { width: number; height: number }; // original capture surface for fixations
	iaSurfaceSize?: { width: number; height: number }; // original capture surface for IAs
	normalizeFixationTime?: boolean; // subtract min start from all fixations
	normalizeIATime?: boolean; // subtract min start from all IAs
	style?: import('react').CSSProperties;
	className?: string;
	initialShowFixations?: boolean;
	initialShowIAs?: boolean;
	pointColor?: string;
	pointOpacity?: number;
	pointRadiusPx?: number;
	fixationColumnMap?: FixationColumnMap;
	iaColumnMap?: IAColumnMap;
	iaRowToShape?: (row: Record<string, unknown>) => IARecord | null;
	onParseError?: (error: unknown) => void;
	onReady?: () => void;
}

export interface ParsedData {
	fixations: FixationRecord[];
	ias: IARecord[];
}

