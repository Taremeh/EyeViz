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
					iaSource="/IA_report_sample.txt"
					coordinateSystem="pixels"
					timestampUnit="ms"
					fixationColumnMap={{
						x: "CURRENT_FIX_X",
						y: "CURRENT_FIX_Y",
						startMs: "CURRENT_FIX_START",
						durationMs: "CURRENT_FIX_DURATION"
					}}
					// IA sample doesn't contain geometry; overlay will be empty unless you provide shapes
					// via iaColumnMap (if a geometry file) or iaRowToShape (custom).
					iaRowToShape={() => null}
				/>
			</div>
		</div>
	);
}

