// hero-shaders.js
// GLSL for the hero. One full-screen triangle; everything happens in the fragment shader.
//
// Coordinates:
//   px   device pixels, origin top-left of the hero
//   uv   0..1 across the art box (where the engine image sits in the layout)
//   art  art pixels, the grid of the source layers (PLUME is measured in these)
//   s, n distance downstream from the nozzle, and distance across the flow

export const VERTEX_SHADER = /* glsl */ `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;   // canvas size, device px
uniform float u_scale;       // device px per CSS px
uniform vec4 u_art;          // art box in device px: left, top, width, height
uniform vec2 u_artSize;      // art size in art px
uniform vec2 u_nozzle;       // plume start at the nozzle exit, art px
uniform vec2 u_end;          // plume end, art px
uniform vec2 u_halfWidth;    // plume half-width at the nozzle and at the end, art px
uniform float u_time;        // seconds
uniform vec3 u_background;   // page background (sRGB)
uniform float u_gridAlpha;
uniform float u_gridSize;    // CSS px

uniform sampler2D u_engine;  // engine + stand, premultiplied alpha
uniform sampler2D u_flame;   // plume as emitted light on black
uniform sampler2D u_bloom;   // plume blurred, quarter size
uniform sampler2D u_mach;    // Mach-number contours (illustrative model), premultiplied alpha

// 2D simplex noise. Ian McEwan, Ashima Arts, and Stefan Gustavson (MIT License).
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 screen(vec3 base, vec3 light) {
  return 1.0 - (1.0 - base) * (1.0 - light);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  vec2 uv = (px - u_art.xy) / u_art.zw;
  vec2 art = uv * u_artSize;
  float inArt = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);

  // Plume frame: s runs downstream from the nozzle, n runs across the flow.
  vec2 axis = u_end - u_nozzle;
  float len = length(axis);
  vec2 dir = axis / len;
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 rel = art - u_nozzle;
  float s = dot(rel, dir);
  float n = dot(rel, perp);
  float down = s / len;
  float halfW = mix(u_halfWidth.x, u_halfWidth.y, clamp(down, 0.0, 1.0));
  float r = abs(n) / halfW;   // 0 on the centerline, 1 at the plume's edge

  float t = u_time;
  float flicker = 1.0 + 0.045 * snoise(vec2(t * 1.7, 0.0)) + 0.025 * snoise(vec2(t * 6.3, 4.0));

  // The plume. Eddies in the shear layer ride downstream and grow with distance; the core
  // barely moves, so the shock diamonds hold their places the way they do in a real plume.
  vec3 flame = vec3(0.0);
  if (r < 1.8 && down > -0.05 && down < 1.15) {
    float grow = clamp(down, 0.0, 1.0);
    float shear = smoothstep(0.3, 1.0, r);

    vec2 eq = vec2(s / 170.0 - t * 2.2, n / 60.0);
    float eddy = snoise(eq) * 0.7 + snoise(eq * 2.1 + vec2(7.1, 3.4)) * 0.3;
    float amp = mix(1.0, 12.0, grow) * shear;
    vec2 warp = perp * (eddy * amp) + dir * (eddy * amp * 0.3);
    flame = texture2D(u_flame, (art - warp) / u_artSize).rgb;

    // Brighter and darker patches carried downstream, mostly in the shear layer.
    float pulse = snoise(vec2(s / 220.0 - t * 3.0, n / 90.0 + 5.0));
    flame *= 1.0 + pulse * mix(0.05, 0.16, shear) * smoothstep(0.0, 0.3, grow);

    // The diamonds shimmer in place.
    float shimmer = snoise(vec2(s / 110.0, t * 3.1));
    flame *= 1.0 + shimmer * 0.06 * (1.0 - shear);

    // The tail breaks up as it dissipates, in blobs stretched along the flow.
    float tail = smoothstep(0.5, 0.95, down);
    vec2 tq = vec2(s / 120.0 - t * 1.8, n / 60.0);
    float breakup = snoise(tq) * 0.65 + snoise(tq * 2.2 + vec2(3.7, 9.1)) * 0.35;
    flame *= max(1.0 + 0.45 * tail * breakup, 0.0);

    flame *= flicker;
  }
  float flameLum = dot(flame, vec3(0.2126, 0.7152, 0.0722));

  // Heat haze: a refraction field around the exhaust. It bends what is behind the plume
  // (the grid), not the engine, which sits beside it.
  vec2 haze = vec2(0.0);
  float hazeMask = (1.0 - smoothstep(1.0, 2.6, r)) * smoothstep(-0.06, 0.04, down)
                 * (1.0 - smoothstep(0.85, 1.25, down)) * inArt;
  if (hazeMask > 0.001) {
    vec2 q = art / 64.0;
    float along = dot(q, dir);
    float across = dot(q, perp);
    float h1 = snoise(vec2(along * 0.7 - t * 1.3, across * 1.2));
    float h2 = snoise(vec2(along * 1.4 - t * 2.1 + 11.0, across * 1.9 - 3.0));
    haze = (perp * (h1 * 0.7 + h2 * 0.3) + dir * (h2 * 0.35)) * (hazeMask * 2.0 * u_scale);
  }

  // Glow from the plume, and the grid behind it: bent by the haze, catching the glow,
  // and lost behind the bright plume itself.
  vec3 bloom = texture2D(u_bloom, clamp(uv, 0.0, 1.0)).rgb * inArt;
  vec2 g = (px + haze) / u_scale - 0.5;
  vec2 d = abs(fract(g / u_gridSize + 0.5) - 0.5) * u_gridSize;
  float aa = 0.75 / u_scale;
  float line = (1.0 - smoothstep(0.5 - aa, 0.5 + aa, min(d.x, d.y)))
             * (1.0 - smoothstep(0.04, 0.4, flameLum));
  vec3 color = u_background + line * (u_gridAlpha + bloom * 0.3);

  // The Mach-number contours sit on the grid, behind the glow and the flame. The haze bends
  // them too, a little less than the grid, so the lines shimmer but stay readable.
  vec4 mach = texture2D(u_mach, clamp(uv + haze * 0.6 / u_art.zw, 0.0, 1.0)) * inArt;
  color = mach.rgb + color * (1.0 - mach.a);

  vec3 lit = screen(color, bloom * (0.42 * flicker));
  lit = screen(lit, flame);

  // Engine on top. The nozzle picks up the flame's flicker.
  vec4 engine = texture2D(u_engine, clamp(uv, 0.0, 1.0)) * inArt;
  float nozzleLight = exp(-length(art - u_nozzle) / 170.0);
  engine.rgb *= 1.0 + (flicker - 1.0) * 2.4 * nozzleLight;
  vec3 result = engine.rgb + lit * (1.0 - engine.a);

  // Dither so the glow's long gradients don't band.
  result += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(result, 1.0);
}
`;
