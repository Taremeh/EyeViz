"use client";

import React from "react";
import { EyeViz } from "eyeviz";

export default function Page() {
	return (
		<div style={{ maxWidth: 1000, margin: "40px auto", padding: 16 }}>
			<h1>EyeViz Next.js Example</h1>
			<p>Simple demo using the provided sample files.</p>
			<div style={{ marginTop: 16 }}>
				<EyeViz
					videoSrc="/screenrecording_sample.mp4"
					fixationSource="/fixation_report_sample.csv"
					iaSource="/dynamic_interest_areas_sample.ias"
					coordinateSystem="pixels"
					timestampUnit="ms"
					// normalizeFixationTime
					// normalizeIATime
					fixationSurfaceSize={{ width: 1920, height: 1080 }}
					iaSurfaceSize={{ width: 1920, height: 1080 }}
					pointRadiusPx={12}
					fixationColumnMap={{
						x: "CURRENT_FIX_X",
						y: "CURRENT_FIX_Y",
						startMs: "CURRENT_FIX_START",
						durationMs: "CURRENT_FIX_DURATION",
						endMs: "CURRENT_FIX_END"
					}}
					// .ias already provides IA geometry and timing
				/>
			</div>
		</div>
	);
}

