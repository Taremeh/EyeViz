import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseFixationsFromSource, parseIAsFromSource } from '../src/utils/parse';

// Node has File and Blob but no FileReader, which the parsers use to read them.
beforeAll(() => {
	class NodeFileReader {
		result: unknown = null;
		onload: (() => void) | null = null;
		onerror: ((error: unknown) => void) | null = null;
		private read(promise: Promise<unknown>) {
			promise.then(
				value => {
					this.result = value;
					this.onload?.();
				},
				error => this.onerror?.(error)
			);
		}
		readAsText(blob: Blob) {
			this.read(blob.text());
		}
		readAsArrayBuffer(blob: Blob) {
			this.read(blob.arrayBuffer());
		}
	}
	(globalThis as any).FileReader = NodeFileReader;
});

const sample = (name: string) => readFileSync(new URL(`../data/${name}`, import.meta.url));

describe('parseFixationsFromSource', () => {
	it('returns an array as it is', async () => {
		const fixations = [{ x: 1, y: 2, startMs: 3, durationMs: 4 }];
		expect(await parseFixationsFromSource(fixations)).toBe(fixations);
	});

	it('reads EyeLink column names from tab-separated text', async () => {
		const text = [
			'RECORDING_SESSION_LABEL\tCURRENT_FIX_INDEX\tCURRENT_FIX_X\tCURRENT_FIX_Y\tCURRENT_FIX_START\tCURRENT_FIX_DURATION',
			'demo\t1\t100.5\t200\t10\t250',
			'demo\t2\t300\t400,5\t300\t120'
		].join('\n');
		const fixations = await parseFixationsFromSource(text);
		expect(fixations).toHaveLength(2);
		expect(fixations[0]).toMatchObject({ x: 100.5, y: 200, startMs: 10, durationMs: 250, id: '1' });
		expect(fixations[1].y).toBe(400.5); // decimal comma
	});

	it('converts seconds to milliseconds', async () => {
		const fixations = await parseFixationsFromSource('x,y,startSec,durationSec\n10,20,1.5,0.25\n');
		expect(fixations).toEqual([expect.objectContaining({ x: 10, y: 20, startMs: 1500, durationMs: 250 })]);
	});

	it('derives the duration from start and end', async () => {
		const fixations = await parseFixationsFromSource('x;y;start;end\n10;20;100;180\n');
		expect(fixations[0].durationMs).toBe(80);
	});

	it('uses a column map for other names', async () => {
		const fixations = await parseFixationsFromSource('gazeLeft,gazeTop,t0,len\n5,6,7,8\n', {
			columns: { x: 'gazeLeft', y: 'gazeTop', startMs: 't0', durationMs: 'len' }
		});
		expect(fixations[0]).toMatchObject({ x: 5, y: 6, startMs: 7, durationMs: 8 });
	});

	it('skips rows without a position or time', async () => {
		const fixations = await parseFixationsFromSource('x,y,start,duration\n1,2,3,4\n,2,3,4\n1,2,,4\n');
		expect(fixations).toHaveLength(1);
	});

	it('reads an .xlsx file', async () => {
		const sheet = XLSX.utils.json_to_sheet([
			{ x: 1, y: 2, start: 3, duration: 4 },
			{ x: 5, y: 6, start: 7, duration: 8 }
		]);
		const book = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(book, sheet, 'Fixations');
		const file = new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'fixations.xlsx');
		const fixations = await parseFixationsFromSource(file);
		expect(fixations).toEqual([
			expect.objectContaining({ x: 1, y: 2, startMs: 3, durationMs: 4 }),
			expect.objectContaining({ x: 5, y: 6, startMs: 7, durationMs: 8 })
		]);
	});

	it('reads the UTF-16 sample report', async () => {
		const file = new File([sample('fixation_report_sample.csv')], 'fixation_report_sample.csv');
		const fixations = await parseFixationsFromSource(file);
		expect(fixations.length).toBeGreaterThan(8000);
		expect(fixations[0]).toMatchObject({ x: -235.3, y: 719.5, startMs: 7, durationMs: 285 });
	});
});

describe('parseIAsFromSource', () => {
	const ias = [
		'# IA\tstart_time\tend_time\tshape\tID\tx\ty\tright\tbottom\tlabel',
		'-1000\t-1500\tRECTANGLE\t1\t10\t20\t110\t70\tfirst',
		'-1500\t-2500\tRECTANGLE\t2\t10\t20\t5\t70\tno width'
	].join('\n');

	it('returns nothing without a source', async () => {
		expect(await parseIAsFromSource(undefined)).toEqual([]);
	});

	it('reads dynamic interest areas, ignoring the sign of the times', async () => {
		expect(await parseIAsFromSource(ias)).toEqual([
			{ type: 'rect', rect: { x: 10, y: 20, width: 100, height: 50 }, id: '1', label: 'first', startMs: 1000, endMs: 1500 }
		]);
	});

	it('converts interest area times to milliseconds', async () => {
		const [inSeconds] = await parseIAsFromSource(ias, { timestampUnit: 's' });
		expect(inSeconds).toMatchObject({ startMs: 1_000_000, endMs: 1_500_000 });
		const [inMicroseconds] = await parseIAsFromSource(ias, { timestampUnit: 'us' });
		expect(inMicroseconds).toMatchObject({ startMs: 1, endMs: 1.5 });
	});

	it('reads rectangles, circles and polygons from a table', async () => {
		const rects = await parseIAsFromSource('x,y,width,height,label\n1,2,30,40,box\n');
		expect(rects[0]).toMatchObject({ type: 'rect', rect: { x: 1, y: 2, width: 30, height: 40 }, label: 'box' });
		const circles = await parseIAsFromSource('cx,cy,r\n50,60,7\n');
		expect(circles[0]).toMatchObject({ type: 'circle', circle: { cx: 50, cy: 60, r: 7 } });
		const triangle = { type: 'polygon', polygon: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }] };
		const fromPoints = await parseIAsFromSource('label,points\ntri,"10,10; 50,10; 50,50"\n');
		expect(fromPoints[0]).toMatchObject(triangle);
		const fromColumns = await parseIAsFromSource('label,x1,y1,x2,y2,x3,y3\ntri,10,10,50,10,50,50\n');
		expect(fromColumns[0]).toMatchObject(triangle);
	});

	it('lets the caller build shapes from raw rows', async () => {
		const shapes = await parseIAsFromSource('IA_ID,IA_LABEL\n1,keep\n2,drop\n', {
			iaRowToShape: row =>
				String(row['IA_ID']) === '1'
					? { type: 'rect', rect: { x: 0, y: 0, width: 1, height: 1 }, label: String(row['IA_LABEL']) }
					: null
		});
		expect(shapes).toEqual([{ type: 'rect', rect: { x: 0, y: 0, width: 1, height: 1 }, label: 'keep' }]);
	});

	it('reads the sample .ias file', async () => {
		const file = new File([sample('dynamic_interest_areas_sample.ias')], 'dynamic_interest_areas_sample.ias');
		const areas = await parseIAsFromSource(file);
		expect(areas.length).toBeGreaterThan(0);
		expect(areas[0]).toMatchObject({
			type: 'rect',
			id: '1',
			label: 'autolabel_1',
			startMs: 1176028,
			endMs: 1176284
		});
	});
});
