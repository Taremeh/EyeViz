"use client";

import React from "react";
import { EyeViz } from "eyeviz";

export default function Page() {
	const videoRef = React.useRef<HTMLVideoElement>(null);

	const handlePlayPause = () => {
		if (videoRef.current) {
			if (videoRef.current.paused) {
				videoRef.current.play();
			} else {
				videoRef.current.pause();
			}
		}
	};

	return (
		<div style={{ maxWidth: 1000, margin: "40px auto", padding: 16 }}>
			<h1>EyeViz Next.js Example</h1>
			<p>Simple demo using the provided sample files.</p>
			<p>
				<button onClick={handlePlayPause} style={{ padding: "8px 16px", cursor: "pointer" }}>
					Play/Pause (via ref)
				</button>
			</p>
			<div style={{ marginTop: 16 }}>
				<EyeViz
					ref={videoRef}
					videoSrc="/screenrecording_sample.mp4"
					fixationSource="/fixation_report_sample.csv"
					iaSource="/dynamic_interest_areas_sample.ias"
					coordinateSystem="pixels"
					timestampUnit="ms"
					// normalizeFixationTime
					// normalizeIATime
					fixationSurfaceSize={{ width: 1920, height: 1080 }}
					iaSurfaceSize={{ width: 1920, height: 1080 }}
					fixationColumnMap={{
						x: "CURRENT_FIX_X",
						y: "CURRENT_FIX_Y",
						startMs: "CURRENT_FIX_START",
						durationMs: "CURRENT_FIX_DURATION",
						endMs: "CURRENT_FIX_END"
					}}
					// IA styling
					iaFillStyle="rgba(200, 200, 0, 0.1)"
					iaStrokeStyle="rgba(255, 198, 26, 0.9)"
					iaLineWidth={7}
					iaOpacity={1}
					// Fixation styling
					pointColor="rgba(255,0,0,0.8)"
					pointOpacity={0.85}
					pointRadiusPx={18}
					// .ias already provides IA geometry and timing
					// You can now pass any video element props:
					loop
					muted
					autoPlay={false}
				/>
			</div>
		</div>
	);
}

