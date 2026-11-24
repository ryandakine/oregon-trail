// HIGH tone tier post effect — the composed pass (graphics-pop-research § 3
// Phase C, items C1/C4/C5). This is the only shader in this directory that is
// loaded at runtime.
//
// WHY COMPOSED: kaplay's usePostEffect() writes one slot —
// `gfx.postShader = shader` (vendored kaplay.mjs) — so a second call replaces
// the first instead of stacking on it. VHS + grain + CRT + aberration
// therefore cannot be chained; they are folded into this program and mixed by
// uniform instead. The four source units next to this file stay separate so
// each effect is readable on its own and the vendored pair stays diffable.
//
// Portions adapted from the KAPLAY examples, MIT, Copyright (c) 2025 KAPLAY
// Team: the YIQ chroma bleed and its circle() tap pattern come from
// examples/shaders/vhs.frag, the barrel distortion and scanline falloff from
// examples/shaders/crt.frag.
//
// u_intensity  chroma bleed radius, in logical (640x480) pixels
// u_grain      film grain strength, 0 = off
// u_crt        barrel + scanline mix, 0 = flat panel, 1 = full CRT
// u_dread      radial chromatic aberration magnitude, 0 = registered
// u_time       seconds; churns the grain
// u_res        logical frame resolution

uniform float u_intensity;
uniform float u_grain;
uniform float u_crt;
uniform float u_dread;
uniform float u_time;
uniform vec2 u_res;

// Widest |x| that circle() below can return, so u_intensity reads in pixels.
const float CIRCLE_SPAN = 6.58318;

// Upstream's matrices are the transposes of the textbook YIQ pair, which makes
// them each other's inverse — the round trip is identity, so sampling the
// three components at different radii is what produces the bleed. Kept as
// shipped rather than "corrected".
vec3 rgb2yiq(vec3 c) {
	return vec3(
		(0.299 * c.r + 0.5959 * c.g + 0.2115 * c.b),
		(0.587 * c.r - 0.2746 * c.g - 0.5227 * c.b),
		(0.114 * c.r - 0.3213 * c.g + 0.3112 * c.b)
	);
}

vec3 yiq2rgb(vec3 c) {
	return vec3(
		(1.0 * c.r + 1.0 * c.g + 1.0 * c.b),
		(0.956 * c.r - 0.272 * c.g - 1.106 * c.b),
		(0.619 * c.r - 0.647 * c.g + 1.703 * c.b)
	);
}

vec2 circle(float start, float pts, float pt) {
	float rad = (3.14159 * 2.0 * (1.0 / pts)) * (pt + start);
	return vec2(-(0.3 + rad), cos(rad));
}

// 8 taps rather than upstream's 15, and run twice per pixel rather than three
// times: the horizontal-dominant offset pattern is what carries the look, not
// the tap count.
vec3 bleed(sampler2D samp, vec2 uv, float d) {
	vec2 scale = vec2(d) / (CIRCLE_SPAN * u_res.x);
	vec3 sum = texture2D(samp, uv).rgb;
	for (int i = 0; i < 7; i++) {
		sum += texture2D(samp, uv + circle(2.0 / 7.0, 7.0, float(i)) * scale).rgb;
	}
	return sum / 8.0;
}

float hash21(vec2 p) {
	vec2 h = fract(p * vec2(0.3183099, 0.3678794));
	h += dot(h, h.yx + 3.7);
	return fract(h.x * h.y);
}

vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
	// ── Barrel (crt.frag), eased by u_crt so it is a no-op at rest ──
	vec2 center = vec2(0.5, 0.5);
	vec2 off = uv - center;
	vec2 warped = center + off * (1.0 + pow(abs(off.yx), vec2(2.6)));
	vec2 suv = mix(uv, warped, u_crt);
	float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
	suv = clamp(suv, 0.0, 1.0);

	// ── Tape tracking: one band creeping up the frame on a ~13s cycle. The
	// single clearest "this is a tape, not a filter" cue, so it is the one
	// thing here allowed to move geometry.
	//
	// The displacement is COHERENT across the band, not per-row. Per-row
	// noise shreds any text the band crosses — measured on the party strip,
	// which this band sits on top of once every 13 seconds. Weighting one
	// offset by the smoothstep instead shears the band like a head-switching
	// glitch and leaves glyphs readable ──
	float bandY = fract(u_time * 0.077);
	float band = smoothstep(0.055, 0.0, abs(suv.y - bandY));
	suv.x += band * (hash21(vec2(floor(u_time * 8.0), 3.0)) - 0.5) * (2.5 / u_res.x);

	// ── Chroma bleed (vhs.frag) with the aberration offset (aberrate.frag)
	// riding the same taps: the components are already being sampled at
	// different radii, so splitting two of them radially costs nothing extra
	// and lands as the red/cyan fringe u_dread is meant to produce.
	//
	// Luma is taken from an unblurred tap. That is how the format actually
	// fails — full luma bandwidth, starved chroma — and it is also what keeps
	// glyph edges crisp while color smears off them ──
	vec2 fringe = (suv - center) * (u_dread * 4.4 / u_res.x);
	float d = u_intensity;

	float y = rgb2yiq(texture2D(tex, suv + fringe).rgb).r;
	float i = rgb2yiq(bleed(tex, suv, d * 3.0)).g;
	float q = rgb2yiq(bleed(tex, suv - fringe, d * 6.0)).b;

	vec3 rgb = yiq2rgb(vec3(y, i, q));

	// Chroma loss and a floated black level — the two things every dubbed
	// tape does to a picture. Small: crushed blacks are the horror, this only
	// takes the edge off the digital cleanliness.
	rgb = mix(rgb, vec3(dot(rgb, vec3(0.299, 0.587, 0.114))), 0.16);
	rgb = rgb * 0.96 + 0.018 + band * 0.05;

	// ── Film grain (grain.frag) ──
	float g = hash21(floor(suv * u_res) + floor(u_time * 24.0) * vec2(37.0, 17.0));
	float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
	float gate = smoothstep(0.02, 0.30, luma) * (1.0 - smoothstep(0.55, 0.92, luma));
	rgb += (g - 0.5) * u_grain * gate;

	// ── Scanlines + out-of-barrel falloff (crt.frag) ──
	float fv = fract(suv.y * 120.0);
	fv = min(1.0, 0.8 + 0.5 * min(fv, 1.0 - fv));
	rgb *= mix(1.0, fv * inside, u_crt);

	// Alpha is passed through untouched rather than forced to 1.0 like
	// upstream's crt.frag: this canvas clears transparent so it can composite
	// over the 3D layer, and the frag template discards on alpha 0.
	float a = texture2D(tex, suv).a;
	return vec4(color.rgb * rgb, a) * color.a;
}
