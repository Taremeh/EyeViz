import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { FixationRecord, IARecord, FixationColumnMap, IAColumnMap } from '../types';

function isUrlLike(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

async function readAsText(input: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result ?? ''));
		reader.onerror = reject;
		reader.readAsText(input);
	});
}

async function readAsArrayBuffer(input: Blob): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as ArrayBuffer);
		reader.onerror = reject;
		reader.readAsArrayBuffer(input);
	});
}

function looksLikeCSV(filename?: string, contentHint?: string): boolean {
	if (filename && /\.(csv|tsv)$/i.test(filename)) return true;
	return !!contentHint && /[,;\t].*\n/.test(contentHint);
}

function looksLikeXLS(filename?: string): boolean {
	return !!filename && /\.(xls|xlsx)$/i.test(filename);
}

function normalizeHeader(header: string): string {
	return header.trim().toLowerCase().replace(/\s+|\[.*?\]|\(.*?\)|\./g, '');
}

function toNumber(value: unknown): number | undefined {
	if (value == null || value === '') return undefined;
	const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
	return Number.isFinite(n) ? n : undefined;
}

function toString(value: unknown): string | undefined {
	if (value == null) return undefined;
	const s = String(value).trim();
	return s.length ? s : undefined;
}

function pick(row: Record<string, unknown>, col?: string): unknown {
	if (!col) return undefined;
	const normalized = normalizeHeader(col);
	// Match by normalized keys or original
	for (const [k, v] of Object.entries(row)) {
		if (normalizeHeader(k) === normalized) return v;
	}
	return undefined;
}

function detectFixationRow(
	row: Record<string, unknown>,
	columns?: FixationColumnMap
): FixationRecord | null {
	// Create a normalized header map
	const map: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(row)) {
		map[normalizeHeader(k)] = v;
	}

	// Candidates
	const x =
		toNumber(pick(row, columns?.x)) ??
		toNumber(map['x']) ??
		toNumber(map['current_fix_x']) ??
		toNumber(map['mappedfixationpointx']) ??
		toNumber(map['gx']) ??
		toNumber(map['positionx']) ??
		toNumber(map['fixationx']);
	const y =
		toNumber(pick(row, columns?.y)) ??
		toNumber(map['y']) ??
		toNumber(map['current_fix_y']) ??
		toNumber(map['mappedfixationpointy']) ??
		toNumber(map['gy']) ??
		toNumber(map['positiony']) ??
		toNumber(map['fixationy']);

	// time columns in ms or s
	const startMs =
		toNumber(pick(row, columns?.startMs)) ??
		toNumber(map['startms']) ??
		toNumber(map['start']) ??
		toNumber(map['current_fix_start']) ??
		toNumber(map['timestamp']) ??
		toNumber(map['sampstart']) ??
		(() => {
			const s =
				toNumber(pick(row, columns?.startSec)) ??
				toNumber(map['startsec']) ??
				toNumber(map['time']) ??
				toNumber(map['sec']);
			return s != null ? s * 1000 : undefined;
		})();

	const durationMs =
		toNumber(pick(row, columns?.durationMs)) ??
		toNumber(map['duration']) ??
		toNumber(map['dur']) ??
		toNumber(map['current_fix_duration']) ??
		toNumber(map['durationms']) ??
		(() => {
			const s =
				toNumber(pick(row, columns?.durationSec)) ??
				toNumber(map['durationsec']) ??
				toNumber(map['durations']);
			return s != null ? s * 1000 : undefined;
		})();

	if (x == null || y == null || startMs == null || durationMs == null) {
		return null;
	}

	const color = toString(pick(row, columns?.color)) ?? toString(map['color']);
	const opacity = toNumber(pick(row, columns?.opacity)) ?? toNumber(map['opacity']);
	const radiusPx = toNumber(pick(row, columns?.radiusPx)) ?? toNumber(map['radius']) ?? toNumber(map['radiuspx']);
	const id =
		toString(pick(row, columns?.id)) ??
		toString(map['id']) ??
		toString(map['fixationid']) ??
		toString(map['current_fix_index']);

	return {
		x,
		y,
		startMs,
		durationMs,
		radiusPx,
		color,
		opacity,
		id
	};
}

function parsePointsString(points: string): Array<{ x: number; y: number }> {
	// Formats supported: "x1,y1; x2,y2; x3,y3" or "x1 y1, x2 y2" or "x1,y1 x2,y2"
	const tokens = points
		.replace(/\s*;\s*/g, ' ')
		.trim()
		.split(/\s+/);
	const out: Array<{ x: number; y: number }> = [];
	for (const token of tokens) {
		const [xs, ys] = token.split(/[,\s]/).filter(Boolean);
		const x = Number(xs);
		const y = Number(ys);
		if (Number.isFinite(x) && Number.isFinite(y)) {
			out.push({ x, y });
		}
	}
	return out;
}

function detectIARow(row: Record<string, unknown>, columns?: IAColumnMap): IARecord | null {
	const map: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(row)) {
		map[normalizeHeader(k)] = v;
	}

	const id =
		toString(pick(row, columns?.id)) ??
		toString(map['id']) ??
		toString(map['iaid']) ??
		toString(map['ia_id']) ??
		toString(map['name']);
	const label =
		toString(pick(row, columns?.label)) ??
		toString(map['label']) ??
		toString(map['ialabel']) ??
		toString(map['ia_label']) ??
		toString(map['name']);
	const color = toString(pick(row, columns?.color)) ?? toString(map['color']);
	const opacity = toNumber(pick(row, columns?.opacity)) ?? toNumber(map['opacity']);

	// Rect
	const rx = toNumber(pick(row, columns?.x)) ?? toNumber(map['x']) ?? toNumber(map['left']);
	const ry = toNumber(pick(row, columns?.y)) ?? toNumber(map['y']) ?? toNumber(map['top']);
	const rwidth = toNumber(pick(row, columns?.width)) ?? toNumber(map['width']) ?? toNumber(map['w']);
	const rheight = toNumber(pick(row, columns?.height)) ?? toNumber(map['height']) ?? toNumber(map['h']);
	if (rx != null && ry != null && rwidth != null && rheight != null) {
		return {
			type: 'rect',
			rect: { x: rx, y: ry, width: rwidth, height: rheight },
			id,
			label,
			color,
			opacity
		};
	}

	// Circle
	const cx = toNumber(pick(row, columns?.cx)) ?? toNumber(map['cx']) ?? toNumber(map['centerx']);
	const cy = toNumber(pick(row, columns?.cy)) ?? toNumber(map['cy']) ?? toNumber(map['centery']);
	const r = toNumber(pick(row, columns?.r)) ?? toNumber(map['r']) ?? toNumber(map['radius']) ?? toNumber(map['radiuspx']);
	if (cx != null && cy != null && r != null) {
		return {
			type: 'circle',
			circle: { cx, cy, r },
			id,
			label,
			color,
			opacity
		};
	}

	// Polygon
	const pointsStr =
		toString(pick(row, columns?.points)) ??
		toString(map['points']) ??
		toString(map['polygon']) ??
		toString(map['coords']);
	if (pointsStr) {
		const polygon = parsePointsString(pointsStr);
		if (polygon.length >= 3) {
			return {
				type: 'polygon',
				polygon,
				id,
				label,
				color,
				opacity
			};
		}
	}

	// Fallback: columns x1,y1,x2,y2,x3,y3...
	const polygon: Array<{ x: number; y: number }> = [];
	for (let i = 1; i <= 20; i++) {
		const x = toNumber(map[`x${i}`]);
		const y = toNumber(map[`y${i}`]);
		if (x == null || y == null) break;
		polygon.push({ x, y });
	}
	if (polygon.length >= 3) {
		return {
			type: 'polygon',
			polygon,
			id,
			label,
			color,
			opacity
		};
	}

	return null;
}

function parseCSVTextToObjects(text: string): Array<Record<string, unknown>> {
	// Avoid generic type parameters to support environments without @types/papaparse
	const result = (Papa.parse as any)(text, {
		header: true,
		dynamicTyping: true,
		skipEmptyLines: true
	});
	if ((result.errors as any)?.length) {
		// Ignore empty line warnings, throw other errors
		const fatal = (result.errors as any).find((e: any) => e.type !== 'FieldMismatch');
		if (fatal) throw new Error(`CSV parse error: ${fatal.message}`);
	}
	return result.data as Array<Record<string, unknown>>;
}

function xlsxToObjects(buffer: ArrayBuffer): Array<Record<string, unknown>> {
	const wb = XLSX.read(buffer, { type: 'array' });
	const firstSheetName = wb.SheetNames[0];
	const sheet = wb.Sheets[firstSheetName];
	return XLSX.utils.sheet_to_json(sheet, { raw: true });
}

export async function parseFixationsFromSource(
	source: string | File | Blob | FixationRecord[],
	options?: { columns?: FixationColumnMap }
): Promise<FixationRecord[]> {
	if (Array.isArray(source)) {
		return source;
	}
	// String may be URL or raw CSV text
	if (typeof source === 'string') {
		if (isUrlLike(source)) {
			const res = await fetch(source);
			const contentType = res.headers.get('content-type') ?? '';
			if (!res.ok) throw new Error(`Failed to fetch fixations: ${res.status}`);
			if (/sheet|excel|officedocument/i.test(contentType) || /\.xlsx?$/i.test(source)) {
				const buf = await res.arrayBuffer();
				const rows = xlsxToObjects(buf);
				return rows.map(r => detectFixationRow(r, options?.columns)).filter((r): r is FixationRecord => !!r);
			}
			const text = await res.text();
			const rows = parseCSVTextToObjects(text);
			return rows.map(r => detectFixationRow(r, options?.columns)).filter((r): r is FixationRecord => !!r);
		}
		// Assume it's CSV/TSV/TXT content
		const rows = parseCSVTextToObjects(source);
		return rows.map(r => detectFixationRow(r, options?.columns)).filter((r): r is FixationRecord => !!r);
	}

	// Blob/File
	const filename = (source as File)?.name;
	if (looksLikeXLS(filename)) {
		const buffer = await readAsArrayBuffer(source);
		const rows = xlsxToObjects(buffer);
		return rows.map(r => detectFixationRow(r, options?.columns)).filter((r): r is FixationRecord => !!r);
	}
	const text = await readAsText(source);
	const rows = looksLikeCSV(filename, text) ? parseCSVTextToObjects(text) : parseCSVTextToObjects(text);
	return rows.map(r => detectFixationRow(r, options?.columns)).filter((r): r is FixationRecord => !!r);
}

export async function parseIAsFromSource(
	source?: string | File | Blob | IARecord[],
	options?: { columns?: IAColumnMap; iaRowToShape?: (row: Record<string, unknown>) => IARecord | null }
): Promise<IARecord[]> {
	if (!source) return [];
	if (Array.isArray(source)) {
		return source;
	}
	const mapRows = (rows: Array<Record<string, unknown>>): IARecord[] => {
		const out = rows
			.map(r => {
				if (options?.iaRowToShape) {
					return options.iaRowToShape(r);
				}
				return detectIARow(r, options?.columns);
			})
			.filter((r): r is IARecord => !!r);
		return out;
	};
	if (typeof source === 'string') {
		if (isUrlLike(source)) {
			const res = await fetch(source);
			const contentType = res.headers.get('content-type') ?? '';
			if (!res.ok) throw new Error(`Failed to fetch IA: ${res.status}`);
			if (/sheet|excel|officedocument/i.test(contentType) || /\.xlsx?$/i.test(source)) {
				const buf = await res.arrayBuffer();
				const rows = xlsxToObjects(buf);
				return mapRows(rows);
			}
			const text = await res.text();
			// TXT may be one IA per line; try CSV parser regardless
			const rows = parseCSVTextToObjects(text);
			return mapRows(rows);
		}
		// Plain text content -> CSV attempt
		const rows = parseCSVTextToObjects(source);
		return mapRows(rows);
	}
	const filename = (source as File)?.name;
	if (looksLikeXLS(filename)) {
		const buffer = await readAsArrayBuffer(source);
		const rows = xlsxToObjects(buffer);
		return mapRows(rows);
	}
	const text = await readAsText(source);
	const rows = parseCSVTextToObjects(text);
	return mapRows(rows);
}

