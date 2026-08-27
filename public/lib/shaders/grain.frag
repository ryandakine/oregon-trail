// Animated luma-gated film grain (graphics-pop-research § 3 C5).
//
// Two things separate film grain from TV static: it churns at the projector's
// 24fps rather than the display's refresh, and it lives in the midtones. The
// smoothstep gate below drops grain to zero in crushed blacks AND in anything
// approaching white, which is what keeps HUD text and stat digits clean while
// the picture around them boils.
//
// Source unit only: the composed pass in horror.frag is what actually runs,
// because usePostEffect() holds a single shader slot.

uniform float uGrainStrength;
uniform float uTime;
uniform vec2 uResolution;

// Kept to small magnitudes end to end: the frag template forces
// `precision mediump float`, and a sin/43758.5453 hash bands badly once the
// argument leaves fp16's usable range.
float hash21(vec2 p) {
	vec2 h = fract(p * vec2(0.3183099, 0.3678794));
	h += dot(h, h.yx + 3.7);
	return fract(h.x * h.y);
}

vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
	vec4 c = def_frag();

	float g = hash21(floor(uv * uResolution) + floor(uTime * 24.0) * vec2(37.0, 17.0));
	float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
	float gate = smoothstep(0.02, 0.30, luma) * (1.0 - smoothstep(0.55, 0.92, luma));

	return vec4(c.rgb + (g - 0.5) * uGrainStrength * gate, c.a);
}
