# EyeViz

[![npm](https://img.shields.io/npm/v/eyeviz)](https://www.npmjs.com/package/eyeviz)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A React component that plays a screen recording with the viewer's gaze drawn on top: fixations as points, and
interest areas (IAs) as shapes that appear and disappear with the recording. It reads the reports that
eye-tracking software exports, so you can replay a session in the browser without converting anything first.

EyeViz is an early version. It is tested with fixation reports and dynamic interest areas from SR Research
EyeLink; other formats work through column mapping but are less tested.

**Contents:** [Features](#features) · [Install](#install) · [Quick start](#quick-start-react) ·
[Next.js](#nextjs-usage) · [File formats](#default-column-mapping-based-on-provided-samples) ·
[Column mapping](#custom-column-names--mapping) · [Props](#props) · [Types](#typescript-types)

## Features

- Parse fixation reports from CSV/XLS/XLSX (and inline CSV/TXT) with flexible header detection
- Parse IA reports from CSV/XLS/XLSX/TXT supporting rect, polygon, and circle areas
- Video + canvas overlay rendering, synchronized by timestamps
- Toggle overlays, configurable point style, coordinate systems (pixels or normalized)
- Next.js/SSR-safe (no `window` access at import time)

## Install

```bash
npm install eyeviz
# or
yarn add eyeviz
```

Peer deps:

```bash
npm install react react-dom
```

## Quick start (React)

```tsx
import React from 'react';
import { EyeViz } from 'eyeviz';

export default function App() {
  return (
    <div style={{ width: 800 }}>
      <EyeViz
        videoSrc="https://example.com/screen-recording.mp4"
        fixationSource="https://example.com/fixations.csv"  // or File/Blob or parsed array
        iaSource="https://example.com/ias.csv"               // optional
        coordinateSystem="pixels"                            // or 'normalized'
        timestampUnit="ms"                                   // or 's'
        videoStartOffsetMs={0}
        pointColor="rgba(255,0,0,0.9)"
        pointRadiusPx={6}
      />
    </div>
  );
}
```

## Next.js usage

- Use the component in a Client Component. Either add `"use client"` at the top of your page/component or wrap EyeViz in a client component.

```tsx
"use client";

import { EyeViz } from 'eyeviz';

export default function Page() {
  return (
    <EyeViz
      videoSrc="/video.mp4"
      fixationSource="/fixations.csv"
      iaSource="/ias.csv"
    />
  );
}
```

If you prefer dynamic import (optional):

```tsx
"use client";

import dynamic from 'next/dynamic';
const EyeViz = dynamic(() => import('eyeviz').then(m => m.EyeViz), { ssr: false });

export default function Page() {
  return <EyeViz videoSrc="/video.mp4" fixationSource="/fixations.csv" />;
}
```

## Default column mapping (based on provided samples)

Fixations (e.g. `fixation_report_sample.csv`, tab-separated):

- **x**: `CURRENT_FIX_X`
- **y**: `CURRENT_FIX_Y`
- **start (ms)**: `CURRENT_FIX_START`
- **duration (ms)**: `CURRENT_FIX_DURATION`

Note: the parser is flexible and also recognizes common variants (e.g., `x`, `y`, `startMs`, `duration`, etc.).

Dynamic IA file (`.ias`, tab-separated):

- Header example:
  `# IA	start_time	end_time	shape	ID	x	y	right	bottom	label`
- Rows example:
  `-1176028	-1176284	RECTANGLE	1	387.77	605.00	713.28	671.00	autolabel_1`
- We ignore the leading '-' on times (treated as absolute).
- Units: milliseconds. Use `iaTimestampUnit` if your data is in a different unit.
- Rectangles are defined by top-left (`x`,`y`) and bottom-right (`right`,`bottom`).

CSV/XLS(X) headers are auto-detected. For fixations, typical columns include:

- x, y (or mapped fixation point variants)
- start/startMs/timestamp (ms) or startSec/time/sec (s)
- duration/durationMs (ms) or durationSec (s)

IAs support:

- Rect: x, y, width, height
- Circle: cx, cy, r
- Polygon: `points` string (e.g. `"10,10; 50,10; 50,50"`), or columns `x1,y1,x2,y2,...`

## Custom column names / mapping

When your columns use different names, supply a mapping:

```tsx
<EyeViz
  videoSrc="/video.mp4"
  fixationSource="/fixation_report_sample.csv"
  iaSource="/IA_report_sample.txt"
  fixationColumnMap={{
    x: 'CURRENT_FIX_X',
    y: 'CURRENT_FIX_Y',
    startMs: 'CURRENT_FIX_START',
    durationMs: 'CURRENT_FIX_DURATION'
  }}
  // If your IA data includes geometry under different column names:
  iaColumnMap={{
    x: 'left',
    y: 'top',
    width: 'width',
    height: 'height',
    // or cx, cy, r for circles; points for polygons
    label: 'IA_LABEL',
    id: 'IA_ID'
  }}
  // If your IA report has no geometry, derive it yourself:
  iaRowToShape={(row) => {
    // Example: map known IA IDs to rectangles (user-supplied)
    // Return null if no shape should be drawn for that row
    if (String(row['IA_ID']) === '1') {
      return { type: 'rect', rect: { x: 100, y: 100, width: 200, height: 150 }, label: String(row['IA_LABEL']) };
    }
    return null;
  }}
/>
```

## Props

**EyeViz-specific props:**

- `videoSrc`: string URL or File/Blob of the screen recording (required)
- `fixationSource`: string URL, File/Blob, or `FixationRecord[]` (required)
- `iaSource`: string URL, File/Blob, or `IARecord[]` (optional)
- `coordinateSystem`: 'pixels' | 'normalized' (default 'pixels')
- `timestampUnit`: 'ms' | 's' (default 'ms') – applied to parsed fixation data
- `iaTimestampUnit`: 'ms' | 's' | 'us' (default 'ms') – applied to parsed IA times (when present)
- `videoStartOffsetMs`: align fixations with video (default 0)
- `iaTimeOffsetMs`: align IAs with video (default 0)
- `initialShowFixations`, `initialShowIAs`: default toggles (true)
- `pointColor`, `pointOpacity`, `pointRadiusPx`: fixation rendering
- IA styling (global defaults; individual IA records can still set `color`/`opacity`):
  - `iaFillStyle` (default `'rgba(0, 128, 255, 0.25)'`)
  - `iaStrokeStyle` (default `'rgba(0, 128, 255, 1)'`)
  - `iaLineWidth` (default `2`)
  - `iaOpacity` (default `0.25`)
- `fixationColumnMap`: map custom fixation column names (x, y, startMs/startSec, durationMs/durationSec, etc.)
- `iaColumnMap`: map custom IA column names (x,y,width,height or cx,cy,r or points, label/id, etc.)
- `iaRowToShape(row)`: if IA report lacks geometry, build shapes from each raw row yourself
- `onParseError(error)`: receive parsing errors
- `onReady()`: fires when video metadata is ready

**All HTML video element props are also supported** (e.g., `loop`, `muted`, `autoPlay`, `onTimeUpdate`, etc.)

## Ref forwarding

The component supports ref forwarding to access the underlying video element:

```tsx
import React, { useRef } from 'react';
import { EyeViz } from 'eyeviz';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleSeek = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 10; // Seek to 10 seconds
    }
  };

  return (
    <div>
      <button onClick={handleSeek}>Seek to 10s</button>
      <EyeViz
        ref={videoRef}
        videoSrc="/video.mp4"
        fixationSource="/fixations.csv"
        // All video element props are available:
        loop
        muted
        onTimeUpdate={(e) => console.log('Current time:', e.currentTarget.currentTime)}
      />
    </div>
  );
}
```

## TypeScript types

```ts
import type { FixationRecord, IARecord } from 'eyeviz';
```

`FixationRecord`:

- `{ x, y, startMs, durationMs, radiusPx?, color?, opacity?, id? }`

`IARecord` is one of:

- Rect: `{ type: 'rect', rect: { x, y, width, height }, ... }`
- Polygon: `{ type: 'polygon', polygon: Array<{ x, y }>, ... }`
- Circle: `{ type: 'circle', circle: { cx, cy, r }, ... }`

## Notes

- Coordinates default to pixel space; for normalized data (0–1), set `coordinateSystem="normalized"`.
- For `.txt` IA files, the parser attempts CSV-style parsing with headers. You can also pass parsed arrays directly.

## Example app

[`examples/nextjs-app`](examples/nextjs-app) is a minimal Next.js app that shows the component with the sample files in [`data/`](data).

## License

[MIT](LICENSE)
