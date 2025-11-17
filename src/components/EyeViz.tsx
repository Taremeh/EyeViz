import React from 'react';
import { EyeVizProps, FixationRecord, IARecord } from '../types';
import { parseFixationsFromSource, parseIAsFromSource } from '../utils/parse';
import { useRaf } from '../hooks/useRaf';

type CSSProperties = Record<string, any>;

function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n));
}

function getVideoNaturalSize(video: HTMLVideoElement): { width: number; height: number } {
	// Use videoWidth/Height if available; fallback to element box
	const width = video.videoWidth || video.clientWidth || 1280;
	const height = video.videoHeight || video.clientHeight || 720;
	return { width, height };
}

function scaleCoord(value: number, system: 'pixels' | 'normalized', max: number, scale: number): number {
	if (system === 'pixels') return value * scale;
	return value * max;
}

function drawIAs(
	ctx: CanvasRenderingContext2D,
	ias: IARecord[],
	currentTimeMs: number,
	coordSystem: 'pixels' | 'normalized',
	canvasWidth: number,
	canvasHeight: number,
	scaleX: number,
	scaleY: number
) {
	for (const ia of ias) {
		// Respect time window if provided
		if (ia.startMs != null && ia.endMs != null) {
			if (!(currentTimeMs >= ia.startMs && currentTimeMs <= ia.endMs)) {
				continue;
			}
		}
		const color = ia.color ?? 'rgba(0, 128, 255, 0.25)';
		const opacity = (ia.opacity ?? 0.25);
		ctx.save();
		ctx.globalAlpha = clamp(opacity, 0, 1);
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.lineWidth = 2;
		if (ia.type === 'rect') {
			const x = scaleCoord(ia.rect.x, coordSystem, canvasWidth, scaleX);
			const y = scaleCoord(ia.rect.y, coordSystem, canvasHeight, scaleY);
			const w = scaleCoord(ia.rect.width, coordSystem, canvasWidth, scaleX);
			const h = scaleCoord(ia.rect.height, coordSystem, canvasHeight, scaleY);
			ctx.beginPath();
			ctx.rect(x, y, w, h);
			ctx.fill();
			ctx.stroke();
		} else if (ia.type === 'polygon') {
			if (ia.polygon.length >= 3) {
				ctx.beginPath();
				const [first, ...rest] = ia.polygon;
				ctx.moveTo(
					scaleCoord(first.x, coordSystem, canvasWidth, scaleX),
					scaleCoord(first.y, coordSystem, canvasHeight, scaleY)
				);
				for (const p of rest) {
					ctx.lineTo(
						scaleCoord(p.x, coordSystem, canvasWidth, scaleX),
						scaleCoord(p.y, coordSystem, canvasHeight, scaleY)
					);
				}
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
			}
		} else if (ia.type === 'circle') {
			const cx = scaleCoord(ia.circle.cx, coordSystem, canvasWidth, scaleX);
			const cy = scaleCoord(ia.circle.cy, coordSystem, canvasHeight, scaleY);
			const r = scaleCoord(ia.circle.r, coordSystem, Math.min(canvasWidth, canvasHeight), (scaleX + scaleY) / 2);
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
		ctx.restore();
	}
}

function drawFixations(
	ctx: CanvasRenderingContext2D,
	fixations: FixationRecord[],
	currentTimeMs: number,
	coordSystem: 'pixels' | 'normalized',
	canvasWidth: number,
	canvasHeight: number,
	scaleX: number,
	scaleY: number,
	defaultColor: string,
	defaultOpacity: number,
	defaultRadiusPx: number
) {
	for (const f of fixations) {
		const start = f.startMs;
		const end = f.startMs + f.durationMs;
		if (currentTimeMs >= start && currentTimeMs <= end) {
			const x = scaleCoord(f.x, coordSystem, canvasWidth, scaleX);
			const y = scaleCoord(f.y, coordSystem, canvasHeight, scaleY);
			const r = f.radiusPx ?? defaultRadiusPx;
			const color = f.color ?? defaultColor;
			const alpha = clamp(f.opacity ?? defaultOpacity, 0, 1);
			ctx.save();
			ctx.beginPath();
			ctx.fillStyle = color;
			ctx.globalAlpha = alpha;
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	}
}

export const EyeViz = ({
	videoSrc,
	fixationSource,
	iaSource,
	coordinateSystem = 'pixels',
	timestampUnit = 'ms',
	iaTimestampUnit = 'ms',
	videoStartOffsetMs = 0,
	iaTimeOffsetMs = 0,
	fixationSurfaceSize,
	iaSurfaceSize,
	normalizeFixationTime,
	normalizeIATime,
	style,
	className,
	initialShowFixations = true,
	initialShowIAs = true,
	pointColor = 'rgba(255, 0, 0, 0.8)',
	pointOpacity = 0.9,
	pointRadiusPx = 6,
	fixationColumnMap,
	iaColumnMap,
	iaRowToShape,
	onParseError,
	onReady
}: EyeVizProps) => {
	const containerRef = React.useRef(null as any);
	const videoRef = React.useRef(null as any);
	const canvasRef = React.useRef(null as any);

	const [fixations, setFixations] = React.useState([] as FixationRecord[]);
	const [ias, setIAs] = React.useState([] as IARecord[]);
	const [showFixations, setShowFixations] = React.useState(initialShowFixations);
	const [showIAs, setShowIAs] = React.useState(initialShowIAs);
	const [ready, setReady] = React.useState(false);

	// Parse inputs (client-side only)
	React.useEffect(() => {
		let mounted = true;
		async function run() {
			try {
				let [fx, ia] = await Promise.all([
					parseFixationsFromSource(fixationSource, { columns: fixationColumnMap }),
					parseIAsFromSource(iaSource, { columns: iaColumnMap, iaRowToShape, timestampUnit: iaTimestampUnit })
				]);
				// Normalize timestamp unit
				const factor = timestampUnit === 's' ? 1000 : 1;
				let normalizedFx = fx.map(f => ({
					...f,
					startMs: f.startMs * factor,
					durationMs: f.durationMs * factor
				}));
				if (normalizeFixationTime && normalizedFx.length) {
					const minStart = Math.min(...normalizedFx.map(f => f.startMs));
					if (Number.isFinite(minStart)) {
						normalizedFx = normalizedFx.map(f => ({ ...f, startMs: f.startMs - minStart }));
					}
				}
				if (normalizeIATime && ia.length) {
					const starts = ia.map(i => i.startMs).filter((v): v is number => typeof v === 'number');
					if (starts.length) {
						const minIA = Math.min(...starts);
						if (Number.isFinite(minIA)) {
							ia = ia.map(i =>
								i.startMs != null
									? { ...i, startMs: i.startMs - minIA, endMs: i.endMs != null ? i.endMs - minIA : i.endMs }
									: i
							);
						}
					}
				}
				if (!mounted) return;
				setFixations(normalizedFx);
				setIAs(ia);
				// eslint-disable-next-line no-console
				console.debug('EyeViz parsed', normalizedFx.length, 'fixations and', ia.length, 'IAs');
			} catch (err) {
				if (onParseError) onParseError(err);
				// eslint-disable-next-line no-console
				console.error(err);
			}
		}
		// Guard SSR
		if (typeof window !== 'undefined') {
			run();
		}
		return () => {
			mounted = false;
		};
	}, [fixationSource, iaSource, timestampUnit, iaTimestampUnit, onParseError]);

	// Resize canvas to match video dimensions
	const resizeCanvasToVideo = React.useCallback(() => {
		const video = videoRef.current;
		const canvas = canvasRef.current;
		if (!video || !canvas) return;
		const { width, height } = getVideoNaturalSize(video);
		canvas.width = width;
		canvas.height = height;
		// Style it to fit container with object-fit contain
		canvas.style.width = '100%';
		canvas.style.height = '100%';
	}, []);

	React.useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		if (video.readyState >= 1) {
			resizeCanvasToVideo();
			setReady(true);
			onReady?.();
		}
		const onLoaded = () => {
			resizeCanvasToVideo();
			setReady(true);
			onReady?.();
		};
		video.addEventListener('loadedmetadata', onLoaded);
		return () => {
			video.removeEventListener('loadedmetadata', onLoaded);
		};
	}, [resizeCanvasToVideo, onReady]);

	// Redraw on RAF
	const drawFrame = React.useCallback(() => {
		const video = videoRef.current;
		const canvas = canvasRef.current;
		if (!video || !canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const { width, height } = getVideoNaturalSize(video);
		// Ensure backing store matches
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		// Clear
		ctx.clearRect(0, 0, width, height);
		// Draw overlays
		const currentTimeMs = video.currentTime * 1000;
		// Compute scaling if surface size differs
		let fixScaleX = 1;
		let fixScaleY = 1;
		let iaScaleX = 1;
		let iaScaleY = 1;
		if (coordinateSystem === 'pixels') {
			if (fixationSurfaceSize) {
				fixScaleX = width / fixationSurfaceSize.width;
				fixScaleY = height / fixationSurfaceSize.height;
			}
			if (iaSurfaceSize) {
				iaScaleX = width / iaSurfaceSize.width;
				iaScaleY = height / iaSurfaceSize.height;
			}
		}
		if (showIAs && ias.length) {
			drawIAs(ctx, ias, currentTimeMs - iaTimeOffsetMs, coordinateSystem, width, height, iaScaleX, iaScaleY);
		}
		if (showFixations && fixations.length) {
			drawFixations(
				ctx,
				fixations,
				currentTimeMs - videoStartOffsetMs,
				coordinateSystem,
				width,
				height,
				fixScaleX,
				fixScaleY,
				pointColor,
				pointOpacity,
				pointRadiusPx
			);
		}
	}, [
		fixations,
		ias,
		showFixations,
		showIAs,
		coordinateSystem,
		videoStartOffsetMs,
		iaTimeOffsetMs,
		pointColor,
		pointOpacity,
		pointRadiusPx
	]);

	useRaf(drawFrame, ready);

	// Maintain aspect ratio fit for video and canvas via CSS
	const containerStyles: CSSProperties = React.useMemo(() => {
		return {
			position: 'relative',
			width: '100%',
			maxWidth: '100%',
			...style
		};
	}, [style]);

	const mediaStyles: CSSProperties = React.useMemo(() => {
		return {
			display: 'block',
			width: '100%',
			height: 'auto',
			objectFit: 'contain'
		};
	}, []);

	const overlayCanvasStyle: CSSProperties = React.useMemo(() => {
		return {
			position: 'absolute',
			inset: 0,
			pointerEvents: 'none'
		};
	}, []);

	const toolbarStyle: CSSProperties = React.useMemo(() => {
		return {
			position: 'absolute',
			top: 8,
			right: 8,
			display: 'flex',
			gap: 8,
			background: 'rgba(0,0,0,0.5)',
			color: 'white',
			padding: '6px 8px',
			borderRadius: 6,
			fontSize: 12,
			alignItems: 'center'
		};
	}, []);

	const source = React.useMemo(() => {
		if (typeof videoSrc === 'string') return videoSrc;
		if (typeof window !== 'undefined' && videoSrc) {
			return URL.createObjectURL(videoSrc);
		}
		return '';
	}, [videoSrc]);

	// Revoke object URL on unmount
	React.useEffect(() => {
		if (typeof videoSrc === 'string') return;
		let objectUrl: string | null = null;
		if (typeof window !== 'undefined' && videoSrc) {
			objectUrl = URL.createObjectURL(videoSrc);
		}
		return () => {
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
			}
		};
	}, [videoSrc]);

	return (
		<div ref={containerRef} className={className} style={containerStyles}>
			<div style={{ position: 'relative', width: '100%' }}>
				<video
					ref={videoRef}
					src={source}
					controls
					style={mediaStyles}
					playsInline
				/>
				<canvas ref={canvasRef} style={overlayCanvasStyle} />
				<div style={toolbarStyle}>
					<label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
						<input
							type="checkbox"
							checked={showFixations}
							onChange={(e: any) => setShowFixations(e.target.checked)}
						/>
						Fixations
					</label>
					<label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
						<input
							type="checkbox"
							checked={showIAs}
							onChange={(e: any) => setShowIAs(e.target.checked)}
						/>
						Interest Areas
					</label>
				</div>
			</div>
		</div>
	);
};

export default EyeViz;

