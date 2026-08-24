// 3-tap radial chromatic aberration (graphics-pop-research § 3 C5).
//
// Offset scales with distance from screen center, so the middle of the frame —
// where the wagon and the event text sit — stays registered while the edges
// split. uDread is the whole knob: 0 is optically clean, 1 is roughly 2.2
// logical pixels of split at the frame edge.
//
// Source unit only: the composed pass in horror.frag is what actually runs,
// because usePostEffect() holds a single shader slot.

uniform float uDread;
uniform vec2 uResolution;

vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
	vec2 dir = uv - vec2(0.5);
	vec2 off = dir * (uDread * 4.4 / uResolution.x);

	vec4 c = texture2D(tex, uv);
	float r = texture2D(tex, uv + off).r;
	float b = texture2D(tex, uv - off).b;

	return vec4(color.rgb * vec3(r, c.g, b), c.a) * color.a;
}
