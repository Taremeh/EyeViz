import { useEffect, useRef } from 'react';

type RafCallback = (elapsedMs: number) => void;

export function useRaf(callback: RafCallback, active: boolean) {
	const rafRef = useRef<number | null>(null);
	const startRef = useRef<number | null>(null);

	useEffect(() => {
		if (!active) {
			if (rafRef.current != null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			startRef.current = null;
			return;
		}
		const tick = (t: number) => {
			if (startRef.current == null) startRef.current = t;
			const elapsed = t - startRef.current;
			callback(elapsed);
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
		return () => {
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
			startRef.current = null;
		};
	}, [callback, active]);
}

