import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { FixationRecord, IARecord, FixationColumnMap, IAColumnMap } from '../types';

function isUrlLike(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

function isPathLike(value: string): boolean {
	// Heuristic: likely a path if it looks like "/file.ext" or "./file.ext" or "folder/file.ext"
	// and does NOT contain obvious CSV content chars or newlines
	if (/\r|\n/.test(value)) return false;
	const hasPathSep = /[\/\\]/.test(value);
	const hasExt = /\.[a-z0-9]+$/i.test(value);
	const looksLikeInlineData = /[,;\t]/.test(value); // quick check for CSV-ish content
	return (hasPathSep || hasExt) && !looksLikeInlineData;
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

function decodeTextSmartFromArrayBuffer(buffer: ArrayBuffer, contentType?: string | null): string {
	try {
		const u8 = new Uint8Array(buffer);
		// BOM check
		if (u8.length >= 2) {
			if (u8[0] === 0xff && u8[1] === 0xfe) {
				return new TextDecoder('utf-16le').decode(buffer);
			}
			if (u8[0] === 0xfe && u8[1] === 0xff) {
				try {
					return new TextDecoder('utf-16be' as any).decode(buffer);
				} catch {
					// Some environments might not support utf-16be explicitly; fall back to generic utf-16
					return new TextDecoder('utf-16').decode(buffer);
				}
			}
		}
		// Heuristic: count zeros on even/odd positions
		const sampleLen = Math.min(u8.length, 2000);
		let evenZeros = 0;
		let oddZeros = 0;
		for (let i = 0; i < sampleLen; i++) {
			if (u8[i] === 0) {
				if (i % 2 === 0) evenZeros++;
				else oddZeros++;
			}
		}
		if (evenZeros > oddZeros * 3) {
			try {
				return new TextDecoder('utf-16be' as any).decode(buffer);
			} catch {
				return new TextDecoder('utf-16').decode(buffer);
			}
		}
		if (oddZeros > evenZeros * 3) {
			return new TextDecoder('utf-16le').decode(buffer);
		}
		// Default to UTF-8
		return new TextDecoder('utf-8').decode(buffer);
	} catch {
		// Fallback last resort
		try {
			return new TextDecoder().decode(buffer);
		} catch {
			// Should not happen in modern browsers
			return '';
		}
	}
}

async function fetchTextSmart(url: string): Promise<{ text: string; contentType: string | null }> {
	const res = await fetch(url);
	const contentType = res.headers.get('content-type');
	if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
	// Always decode manually to handle UTF-16 data served without charset
	const buffer = await res.arrayBuffer();
	const text = decodeTextSmartFromArrayBuffer(buffer, contentType);
	return { text, contentType };
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

function toAbsNumber(value: unknown): number | undefined {
	const n = toNumber(value);
	return n == null ? undefined : Math.abs(n);
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

	let durationMs =
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

	// If duration missing but END exists, derive from END - START
	if ((durationMs == null || !Number.isFinite(durationMs)) && startMs != null) {
		const endMs =
			toNumber(pick(row, columns?.endMs)) ??
			toNumber(map['endms']) ??
			toNumber(map['end']) ??
			toNumber(map['current_fix_end']);
		if (endMs != null && Number.isFinite(endMs)) {
			durationMs = endMs - startMs;
		}
	}

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

function parseIASFileText(text: string): IARecord[] {
	// .ias format header example:
	// # IA	start_time	end_time	shape	ID	x	y	right	bottom	label
	const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));
	const out: IARecord[] = [];
	for (const line of lines) {
		const parts = line.split('\t');
		if (parts.length < 9) continue;
		// Detect where shape column is to handle presence/absence of a leading index column
		let startIdx = 0;
		const p2 = (parts[2] || '').toString().toUpperCase();
		const p3 = (parts[3] || '').toString().toUpperCase();
		if (p2 === 'RECTANGLE' || p2 === 'CIRCLE' || p2 === 'POLYGON') {
			startIdx = 0;
		} else if (p3 === 'RECTANGLE' || p3 === 'CIRCLE' || p3 === 'POLYGON') {
			startIdx = 1;
		}
		const startRaw = parts[startIdx + 0];
		const endRaw = parts[startIdx + 1];
		const shape = String(parts[startIdx + 2] || '').toUpperCase();
		const id = String(parts[startIdx + 3] || '').trim();
		const x = toNumber(parts[startIdx + 4]);
		const y = toNumber(parts[startIdx + 5]);
		const right = toNumber(parts[startIdx + 6]);
		const bottom = toNumber(parts[startIdx + 7]);
		const label = String(parts[startIdx + 8] || '').trim();
		const start = toAbsNumber(startRaw);
		const end = toAbsNumber(endRaw);
		if (start == null || end == null) continue;
		if (shape === 'RECTANGLE' && x != null && y != null && right != null && bottom != null) {
			const width = right - x;
			const height = bottom - y;
			if (width > 0 && height > 0) {
				out.push({
					type: 'rect',
					rect: { x, y, width, height },
					id,
					label,
					startMs: start,
					endMs: end
				});
			}
		}
	}
	return out;
}

function detectDelimiter(text: string, filename?: string): string | undefined {
	// Prefer extension hints
	if (filename && /\.(tsv|tab)$/i.test(filename)) return '\t';
	if (filename && /\.(csv)$/i.test(filename)) {
		// Could still be TSV despite .csv; keep checking content
	}
	// Look at the first few non-empty lines
	const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 5);
	const counts: Record<string, number> = { '\t': 0, ';': 0, ',': 0, '|': 0 };
	for (const line of lines) {
		counts['\t'] += (line.match(/\t/g) || []).length;
		counts[';'] += (line.match(/;/g) || []).length;
		counts[','] += (line.match(/,/g) || []).length;
		counts['|'] += (line.match(/\|/g) || []).length;
	}
	const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
	if (best && best[1] > 0) return best[0];
	// Fallback: if tabs present anywhere
	if (/\t/.test(text)) return '\t';
	return undefined;
}

function parseCSVTextToObjects(text: string, filename?: string): Array<Record<string, unknown>> {
	// Strip BOM if present
	if (text.charCodeAt(0) === 0xfeff) {
		text = text.slice(1);
	}
	const baseConfig = {
		header: true,
		dynamicTyping: true,
		skipEmptyLines: true
	};
	const primary = detectDelimiter(text, filename);
	const candidateDelims = Array.from(
		new Set<string>([primary, '\t', ';', '|', ','].filter(Boolean) as string[])
	);
	let firstFatal: any = null;
	for (const delim of candidateDelims) {
		const result = (Papa.parse as any)(text, { ...baseConfig, delimiter: delim });
		const errors = (result.errors as any) || [];
		const fatal = errors.find((e: any) => e.type !== 'FieldMismatch');
		if (!fatal) {
			const data = result.data as Array<Record<string, unknown>>;
			if (Array.isArray(data) && data.length > 0) return data;
			// If parsed but empty, continue trying other delimiters
		}
		// Capture 'UndetectableDelimiter' or any fatal, then try next delimiter
		if (!firstFatal) firstFatal = fatal;
	}
	// Last resort: try Papa's auto-detect
	const auto = (Papa.parse as any)(text, baseConfig);
	const autoErrors = (auto.errors as any) || [];
	const autoFatal = autoErrors.find((e: any) => e.type !== 'FieldMismatch');
	if (!autoFatal) {
		const data = auto.data as Array<Record<string, unknown>>;
		if (Array.isArray(data) && data.length > 0) return data;
	}
	// Manual TSV fallback if content clearly contains tabs
	if (/\t/.test(text)) {
		const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
		if (lines.length > 1) {
			const header = lines[0].split('\t');
			const rows: Array<Record<string, unknown>> = [];
			for (let i = 1; i < lines.length; i++) {
				const cols = lines[i].split('\t');
				const obj: Record<string, unknown> = {};
				for (let j = 0; j < header.length; j++) {
					obj[header[j]] = cols[j];
				}
				rows.push(obj);
			}
			if (rows.length > 0) return rows;
		}
	}
	throw new Error(`CSV parse error: ${String((firstFatal || autoFatal)?.message || 'Unknown error')} (and TSV fallback yielded no rows)`);
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
		if (isUrlLike(source) || (typeof window !== 'undefined' && isPathLike(source))) {
			const { text, contentType } = await fetchTextSmart(source);
			if (/sheet|excel|officedocument/i.test(contentType ?? '') || /\.xlsx?$/i.test(source)) {
				// We fetched as array buffer in fetchTextSmart, but we need the buffer again for xlsx path; refetch array buffer
				const res2 = await fetch(source);
				const buf2 = await res2.arrayBuffer();
				const rows = xlsxToObjects(buf2);
				return rows.map(r => detectFixationRow(r, options?.columns)).filter((r): r is FixationRecord => !!r);
			}
			const rows = parseCSVTextToObjects(text, source);
			const fxs = rows.map(r => detectFixationRow(r, options?.columns)).filter((r): r is FixationRecord => !!r);
			if (typeof window !== 'undefined' && fxs.length === 0) {
				// eslint-disable-next-line no-console
				console.debug('EyeViz fixation parse: 0 records mapped. First row keys:', Object.keys(rows[0] || {}));
			}
			return fxs;
		}
		// Assume it's CSV/TSV/TXT content
		const rows = parseCSVTextToObjects(source);
		const fxs = rows.map(r => detectFixationRow(r, options?.columns)).filter((r): r is FixationRecord => !!r);
		if (typeof window !== 'undefined' && fxs.length === 0) {
			// eslint-disable-next-line no-console
			console.debug('EyeViz fixation parse (inline): 0 records mapped. First row keys:', Object.keys(rows[0] || {}));
		}
		return fxs;
	}

	// Blob/File
	const filename = (source as File)?.name;
	if (looksLikeXLS(filename)) {
		const buffer = await readAsArrayBuffer(source);
		const rows = xlsxToObjects(buffer);
		return rows.map(r => detectFixationRow(r, options?.columns)).filter((r): r is FixationRecord => !!r);
	}
	// Read as buffer and smart-decode to handle UTF-16 files
	const ab = await readAsArrayBuffer(source);
	const text = decodeTextSmartFromArrayBuffer(ab, (source as any)?.type);
	const rows = looksLikeCSV(filename, text) ? parseCSVTextToObjects(text, filename) : parseCSVTextToObjects(text, filename);
	const fxs = rows.map(r => detectFixationRow(r, options?.columns)).filter((r): r is FixationRecord => !!r);
	if (typeof window !== 'undefined' && fxs.length === 0) {
		// eslint-disable-next-line no-console
		console.debug('EyeViz fixation parse (blob): 0 records mapped. First row keys:', Object.keys(rows[0] || {}));
	}
	return fxs;
}

export async function parseIAsFromSource(
	source?: string | File | Blob | IARecord[],
	options?: {
		columns?: IAColumnMap;
		iaRowToShape?: (row: Record<string, unknown>) => IARecord | null;
		timestampUnit?: 'ms' | 's' | 'us';
	}
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
	const scaleToMs = (value: number | undefined): number | undefined => {
		if (value == null) return undefined;
		const unit = options?.timestampUnit ?? 'ms';
		if (unit === 'ms') return value;
		if (unit === 's') return value * 1000;
		if (unit === 'us') return value / 1000;
		return value;
	};
	const scaleIAsToMs = (ias: IARecord[]): IARecord[] => {
		return ias.map(ia => {
			if (ia.startMs != null || ia.endMs != null) {
				return {
					...ia,
					startMs: scaleToMs(ia.startMs),
					endMs: scaleToMs(ia.endMs)
				};
			}
			return ia;
		});
	};
	if (typeof source === 'string') {
		if (isUrlLike(source) || (typeof window !== 'undefined' && isPathLike(source))) {
			const { text, contentType } = await fetchTextSmart(source);
			if (/\.ias$/i.test(source)) {
				return scaleIAsToMs(parseIASFileText(text));
			}
			if (/sheet|excel|officedocument/i.test(contentType ?? '') || /\.xlsx?$/i.test(source)) {
				// Need array buffer for xlsx
				const res2 = await fetch(source);
				const buf2 = await res2.arrayBuffer();
				const rows = xlsxToObjects(buf2);
				return scaleIAsToMs(mapRows(rows));
			}
			// TXT may be one IA per line; try CSV parser regardless
			if (/^#\s*IA/i.test(text)) {
				return scaleIAsToMs(parseIASFileText(text));
			}
			const rows = parseCSVTextToObjects(text, source);
			return scaleIAsToMs(mapRows(rows));
		}
		// Plain text content -> CSV attempt
		if (/^#\s*IA/i.test(source)) {
			return scaleIAsToMs(parseIASFileText(source));
		}
		const rows = parseCSVTextToObjects(source);
		return scaleIAsToMs(mapRows(rows));
	}
	const filename = (source as File)?.name;
	if (filename && /\.ias$/i.test(filename)) {
		const ab = await readAsArrayBuffer(source);
		const text = decodeTextSmartFromArrayBuffer(ab, (source as any)?.type);
		return scaleIAsToMs(parseIASFileText(text));
	}
	if (looksLikeXLS(filename)) {
		const buffer = await readAsArrayBuffer(source);
		const rows = xlsxToObjects(buffer);
		return scaleIAsToMs(mapRows(rows));
	}
	const ab = await readAsArrayBuffer(source);
	const text = decodeTextSmartFromArrayBuffer(ab, (source as any)?.type);
	if (/^#\s*IA/i.test(text)) {
		return scaleIAsToMs(parseIASFileText(text));
	}
	const rows = parseCSVTextToObjects(text, filename);
	return scaleIAsToMs(mapRows(rows));
}

