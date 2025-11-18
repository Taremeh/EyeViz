# EyeViz Next.js Example

Minimal Next.js app showing the `eyeviz` component with your sample data.

## Setup

1) Copy screenrecording, interest area, and fixation report files into `public/`:

2) Install dependencies and link local package:

```bash
cd examples/nextjs-app
npm install
```

3) Build the local package (in a separate terminal):

```bash
cd /EyeViz
npm run build
```

4) Start the example:

```bash
cd examples/nextjs-app
npm run dev
# open http://localhost:3005
```

## About the sample files

- `fixation_report_sample.csv` (tab-separated) contains columns like:
  - `CURRENT_FIX_X`, `CURRENT_FIX_Y`, `CURRENT_FIX_START` (ms), `CURRENT_FIX_DURATION` (ms)
- `dynamic_interest_areas_sample.ias` (tab-separated) contains dynamic IA rectangles WITH timing:

Header example:

```
# IA	start_time	end_time	shape	ID	x	y	right	bottom	label
```

Rows example (tabs between values):

```
-1176028	-1176284	RECTANGLE	1	387.77	605.00	713.28	671.00	autolabel_1
```

Notes:
- Times can be negative; the '-' is ignored (treated as absolute).
- Units: milliseconds.
- Rectangle is defined by `x`/`y` (top-left) and `right`/`bottom` (bottom-right).

The example maps fixation columns via `fixationColumnMap` in `app/page.tsx`:

```tsx
fixationColumnMap={{
  x: 'CURRENT_FIX_X',
  y: 'CURRENT_FIX_Y',
  startMs: 'CURRENT_FIX_START',
  durationMs: 'CURRENT_FIX_DURATION'
}}
```

If you use another IA format (CSV/XLSX), you can still map columns or synthesize shapes:

```tsx
iaColumnMap={{
  x: 'left',
  y: 'top',
  width: 'width',
  height: 'height',
  label: 'IA_LABEL',
  id: 'IA_ID'
}}
```
