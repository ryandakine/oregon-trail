// Oregon Trail 3D render layer — procedural river (M3 crossing scene).
//
// Technique-ported from world-of-claudecraft/src/render/water.ts:
//   - PlaneGeometry water sheet with per-vertex aShoreDepth attribute
//   - Dual scrolling normal maps (canvas-painted, received via params)
//   - Schlick fresnel toward uSkyColor
//   - Sun glints: two Phong lobes (pow 130 * 2.6 + pow 28 * 0.3) — fires bloom
//   - Vertex sine swell (two world-space sines, amplitude scales with fordDifficulty)
//   - THREE.UniformsLib.fog integration
//   - Shoreline foam band (smoothstep on aShoreDepth + animated wave phase)
//
// fordDifficulty 1-5 drives:
//   - Normal scroll rate (current speed)
//   - Swell amplitude (0.04 @ 1 → 0.12 @ 5)
//   - Water tint (1=clear teal, 5=muddy brown-green)
//
// GEOMETRY: river runs along world X, perpendicular to the trail (+Z).
// widthFt (40..900) maps → world width ~6..26u (linear).
//
// ALL randomness: seeded LCG. Math.random() is never called.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Seeded LCG — same constants as textures.mjs so the pattern is house-wide.
// ---------------------------------------------------------------------------

let _seed = 99991;

function rnd() {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}

function seedReset(salt = 0) {
  _seed = (99991 + salt) & 0x7fffffff;
}

// ---------------------------------------------------------------------------
// Difficulty-keyed constants
// ---------------------------------------------------------------------------

/** Map fordDifficulty 1-5 → swell amplitude 0.04..0.12 */
function swellAmp(d) {
  return 0.04 + (d - 1) / 4 * 0.08;
}

/** Map fordDifficulty 1-5 → normal-map scroll speed multiplier 0.6..2.0 */
function currentSpeed(d) {
  return 0.6 + (d - 1) / 4 * 1.4;
}

/**
 * Deep and shallow water colors keyed to difficulty.
 * 1 = clear teal (PALETTE.sky teal)
 * 5 = muddy brown-green
 */
function waterColors(d) {
  // t=0 at d=1 (clear), t=1 at d=5 (muddy)
  const t = (d - 1) / 4;
  // shallow: clear teal → murky yellow-green
  const shallow = new THREE.Color().setRGB(
    (0.18 + t * 0.22),
    (0.50 + t * 0.02),
    (0.48 - t * 0.28),
  );
  // deep: deep blue-green → dark muddy
  const deep = new THREE.Color().setRGB(
    (0.05 + t * 0.18),
    (0.23 + t * 0.10),
    (0.32 - t * 0.22),
  );
  return { shallow, deep };
}

/** widthFt (40..900) → world units (6..26) */
function ftToWorld(widthFt) {
  const t = Math.max(0, Math.min(1, (widthFt - 40) / 860));
  return 6 + t * 20;
}

// ---------------------------------------------------------------------------
// Vertex / Fragment shaders
// ---------------------------------------------------------------------------

const WATER_VERT = /* glsl */`
  attribute float aShoreDepth;
  uniform float uTime;
  uniform float uSwellAmp;
  varying vec3 vWPos;
  varying float vShoreDepth;
  #include <fog_pars_vertex>

  void main() {
    vec3 pos = position;
    // Two world-space sines for organic swell — amplitude driven by difficulty
    pos.y += (sin(uTime * 1.1 + pos.x * 0.35) + sin(uTime * 0.7 + pos.z * 0.28))
             * uSwellAmp;
    vShoreDepth = aShoreDepth;
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWPos = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const WATER_FRAG = /* glsl */`
  uniform sampler2D uNorm1;
  uniform sampler2D uNorm2;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform float uTime;
  uniform float uScrollSpeed;
  varying vec3 vWPos;
  varying float vShoreDepth;
  #include <common>
  #include <fog_pars_fragment>

  void main() {
    // --- Dual normal map scroll ---
    // Coarse map scrolls along +Z (downstream); fine map scrolls diagonally at
    // a different scale. Speed is modulated by uScrollSpeed (fordDifficulty).
    float spd = uScrollSpeed;
    vec3 n1raw = texture2D(uNorm1,
        vWPos.xz * 0.055 + uTime * vec2(0.008, 0.016) * spd).xyz * 2.0 - 1.0;
    vec3 n2raw = texture2D(uNorm2,
        vWPos.xz * 0.110 - uTime * vec2(0.018, 0.009) * spd).xyz * 2.0 - 1.0;

    // Blend and reconstruct normal
    vec2 nm = n1raw.xy * 0.85 + n2raw.xy * 0.60;
    vec3 N = normalize(vec3(nm, 3.1).xzy);

    // --- Fresnel (Schlick) ---
    vec3 V = normalize(cameraPosition - vWPos);
    float cosTheta = max(dot(N, V), 0.0);
    float fresnel = 0.05 + 0.95 * pow(1.0 - cosTheta, 4.0);

    // --- Depth tint shallow → deep ---
    float depth = clamp(vShoreDepth / 5.5, 0.0, 1.0);
    vec3 col = mix(uShallow, uDeep, depth);

    // --- Fresnel sky reflection ---
    col = mix(col, uSkyColor, min(fresnel * 0.65, 0.42));

    // --- Sun glints: two lobes (fires the bloom pass) ---
    float sunAlign = max(dot(reflect(-uSunDir, N), V), 0.0);
    col += uSunColor * pow(sunAlign, 130.0) * 2.6;   // sharp sparkle (HDR, bloom)
    col += uSunColor * pow(sunAlign, 28.0) * 0.30;   // wide lobe survives steep camera

    // --- Shoreline foam ---
    // Band driven by aShoreDepth: tightest near shore, animated by wave phase.
    float foamBand = smoothstep(3.0, 0.1, vShoreDepth + n1raw.x * 0.6);
    foamBand *= foamBand; // square for sharper inner edge
    float foamWave = 0.60 + 0.40 * sin(uTime * 1.8 + vWPos.x * 1.3
                                       + vWPos.z * 0.9 + n2raw.y * 5.5);
    float foam = foamBand * foamWave;
    // Slightly over-white (1.06) so bloom catches the foam band
    col = mix(col, vec3(1.06), clamp(foam, 0.0, 0.90));

    float alpha = max(mix(0.82, 0.96, depth), foam * 0.94);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// ---------------------------------------------------------------------------
// createRiver
// ---------------------------------------------------------------------------

/**
 * Build a procedural river crossing.
 *
 * @param {object} opts
 * @param {THREE.Texture[]} opts.waterNormals   - [tex1, tex2] from textures.waterNormalMaps()
 * @param {number}          opts.widthFt        - River width in game feet (40..900)
 * @param {number}          opts.fordDifficulty - 1-5; drives speed, swell, tint
 * @param {{ heightAt(x:number, absZ:number): number }} opts.terrain - terrain module instance
 * @param {number}          [opts.riverZ=0]     - World-Z center of the river
 *
 * @returns {{ group: THREE.Group, update(dt:number, time:number): void,
 *             setSun(dir:THREE.Vector3, color:THREE.Color): void,
 *             setSky(color:THREE.Color): void,
 *             uniforms: object, dispose(): void }}
 */
export function createRiver({
  waterNormals,
  widthFt = 160,
  fordDifficulty = 2,
  terrain,
  riverZ = 0,
} = {}) {
  const d = Math.max(1, Math.min(5, fordDifficulty));
  const worldWidth = ftToWorld(widthFt);

  // River runs along X; extent in Z drives how many vertices we need for the
  // foam band to look good (~2u vertex spacing).
  const segsX = Math.round(worldWidth / 2) * 2; // always even
  const segsZ = 24; // enough for shore depth variation across the narrow width

  // River is narrow (perpendicular to travel), so Z extent = worldWidth and
  // X extent = wide enough to fill the view (+/-24u each side).
  const riverXExtent = 48;

  const geo = new THREE.PlaneGeometry(riverXExtent, worldWidth, Math.round(riverXExtent / 2), segsZ);
  geo.rotateX(-Math.PI / 2);

  // Water level sits just below the nominal terrain bank height at the trail
  // crossing. We pick -0.15 below the centre bank, then per-vertex shore depth
  // measures how far each vertex is above the terrain (positive = open water,
  // negative = mudflat / barely wet).
  const waterY = (terrain ? terrain.heightAt(0, riverZ) : 0) - 0.15;

  const pos = geo.attributes.position;
  const shoreDepth = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i) + riverZ; // absolute Z in world space
    const groundY = terrain ? terrain.heightAt(vx, vz) : 0;
    shoreDepth[i] = waterY - groundY; // positive = water above ground (open)
  }
  geo.setAttribute('aShoreDepth', new THREE.BufferAttribute(shoreDepth, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const { shallow, deep } = waterColors(d);

  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uNorm1:       { value: waterNormals ? waterNormals[0] : null },
    uNorm2:       { value: waterNormals ? waterNormals[1] : null },
    uSunDir:      { value: new THREE.Vector3(0.45, 0.8, 0.4).normalize() },
    uSunColor:    { value: new THREE.Color(1.0, 0.94, 0.82) },
    uSkyColor:    { value: new THREE.Color(0.43, 0.50, 0.98) },
    uDeep:        { value: deep },
    uShallow:     { value: shallow },
    uTime:        { value: 0 },
    uSwellAmp:    { value: swellAmp(d) },
    uScrollSpeed: { value: currentSpeed(d) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, waterY, riverZ);
  mesh.renderOrder = 1; // render after opaque terrain, before particles

  const group = new THREE.Group();
  group.add(mesh);

  // --- Public API ---

  function update(_dt, time) {
    uniforms.uTime.value = time;
  }

  function setSun(dir, color) {
    uniforms.uSunDir.value.copy(dir).normalize();
    if (color) uniforms.uSunColor.value.copy(color);
  }

  function setSky(color) {
    uniforms.uSkyColor.value.copy(color);
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
    group.clear();
  }

  return { group, update, setSun, setSky, uniforms, dispose };
}

// ---------------------------------------------------------------------------
// createBankDressing
// ---------------------------------------------------------------------------

/**
 * A handful of ford stones along the crossing line.
 * Deterministic (seeded LCG salt 42) — safe for screenshot regression.
 *
 * @param {object} opts
 * @param {{ heightAt(x:number, absZ:number): number }} opts.terrain
 * @param {number} opts.riverZ
 * @param {{ rockMaps(): { map: THREE.Texture, normalMap: THREE.Texture } }} opts.textures
 * @param {number} [opts.count=7]
 *
 * @returns {THREE.Group}
 */
export function createBankDressing({ terrain, riverZ = 0, textures, count = 7 } = {}) {
  seedReset(42);

  const group = new THREE.Group();
  const { map: rockAlbedo, normalMap: rockNormal } = textures
    ? textures.rockMaps()
    : { map: null, normalMap: null };

  for (let i = 0; i < count; i++) {
    // Scatter along X in [-14, 14], just at the water edge (Z near riverZ)
    const px = (rnd() - 0.5) * 28;
    const pzOff = (rnd() - 0.5) * 2.5; // slight fore-aft scatter
    const pz = riverZ + pzOff;
    const groundY = terrain ? terrain.heightAt(px, pz) : 0;

    // Each stone is a slightly flattened icosahedron-sphere.
    const r = 0.18 + rnd() * 0.28;
    const geo = new THREE.SphereGeometry(r, 7, 5);

    // Flatten vertically to look like a river stone
    const flatScale = 0.35 + rnd() * 0.25;
    const posAttr = geo.attributes.position;
    for (let v = 0; v < posAttr.count; v++) {
      posAttr.setY(v, posAttr.getY(v) * flatScale);
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    // Random yaw rotation so no two stones look identical
    const yaw = rnd() * Math.PI * 2;

    const mat = new THREE.MeshStandardMaterial({
      map: rockAlbedo,
      normalMap: rockNormal,
      roughness: 0.88,
      metalness: 0.04,
      color: new THREE.Color().setRGB(
        0.52 + rnd() * 0.12,
        0.50 + rnd() * 0.10,
        0.46 + rnd() * 0.10,
      ),
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(px, groundY + r * flatScale * 0.55, pz);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    group.add(mesh);
  }

  return group;
}
