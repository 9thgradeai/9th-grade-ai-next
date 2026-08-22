export const GLSL_VERSION = `#version 300 es\n`;

export const GLSL_LIB = `
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}
float fbm(vec3 p){
  float a = 0.5;
  float s = 0.0;
  for(int i = 0; i < 4; i++){
    s += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}
`;

const DISSOLVE_BLOCK = `
  if(uDisCount > 0){
    float dn = fbm(vWorld * 21.0 + vSeed * 17.0);
    float dis = 0.0;
    for(int j = 0; j < 4; j++){
      if(j >= uDisCount) break;
      float dd = distance(vWorld, uDisC[j]);
      dis = max(dis, uDisS[j] * smoothstep(uDisR[j] * 1.3, uDisR[j] * 0.4, dd));
    }
    float cut = dis * 1.35 - dn * 0.5;
    alpha *= smoothstep(0.02, 0.34, 1.0 - cut);
    col += vec3(1.0, 0.87, 0.7) * smoothstep(0.26, 0.5, cut) * smoothstep(0.64, 0.5, cut) * 0.45;
  }
`;

const PULSE_BLOCK = `
  for(int k = 0; k < 6; k++){
    if(k >= uPulseCount) break;
    float d = distance(vWorld, uPulseSrc[k]);
    float g = exp(-pow(d - uPulseR[k], 2.0) / 0.0022) * uPulseI[k];
    col += PULSE_WARM * g * PULSE_GAIN;
    alpha += g * ALPHA_GAIN;
  }
`;

const ACT_UNI = `
uniform float uTime;
uniform float uAct[256];
uniform int uPulseCount;
uniform vec3 uPulseSrc[6];
uniform float uPulseR[6];
uniform float uPulseI[6];
uniform int uDisCount;
uniform vec3 uDisC[4];
uniform float uDisR[4];
uniform float uDisS[4];
`;

export const LINE_VS = GLSL_VERSION + `
layout(location = 0) in vec3 aSelf;
layout(location = 1) in vec3 aOther;
layout(location = 2) in float aSide;
layout(location = 3) in float aWidth;
layout(location = 4) in float aId;
layout(location = 5) in float aDim;
layout(location = 6) in float aBirth;
uniform mat4 uVP;
uniform mat4 uModel;
uniform vec2 uRes;
uniform float uWidthScale;
out vec3 vWorld;
out float vSide;
flat out float vId;
out float vDim;
out float vBirth;
out float vSeed;
out float vAtt;
void main(){
  vec4 ws = uModel * vec4(aSelf, 1.0);
  vec4 wo = uModel * vec4(aOther, 1.0);
  vec4 cs = uVP * ws;
  vec4 co = uVP * wo;
  vec2 sp = cs.xy / max(cs.w, 1e-4);
  vec2 op = co.xy / max(co.w, 1e-4);
  vec2 spx = sp * uRes * 0.5;
  vec2 opx = op * uRes * 0.5;
  vec2 dir = spx - opx;
  float len = max(length(dir), 0.001);
  dir /= len;
  vec2 nrm = vec2(-dir.y, dir.x) * (aSide * aWidth * uWidthScale);
  vec2 noff = nrm / (uRes * 0.5);
  gl_Position = vec4(cs.xy + noff * cs.w, cs.z, cs.w);
  vWorld = ws.xyz;
  vSide = aSide;
  vId = aId;
  vDim = aDim;
  vBirth = aBirth;
  vSeed = aId;
  vAtt = clamp(2.0 - cs.w * 0.6, 0.28, 1.05);
}
`;

export const LINE_FS = GLSL_VERSION + `
precision highp float;
#define PULSE_WARM vec3(1.0, 0.88, 0.72)
#define PULSE_GAIN 1.5
#define ALPHA_GAIN 0.45
in vec3 vWorld;
in float vSide;
flat in float vId;
in float vDim;
in float vBirth;
in float vSeed;
in float vAtt;
` + ACT_UNI + `
out vec4 frag;
` + GLSL_LIB + `
void main(){
  float act = uAct[int(vId + 0.5)];
  float fl = 0.86 + 0.14 * sin(uTime * 2.1 + vWorld.x * 41.0 + vWorld.y * 57.0);
  float edge = smoothstep(1.0, 0.25, abs(vSide));
  float core = exp(-vSide * vSide * 3.5);
  float birth = smoothstep(vBirth, vBirth + 1.1, uTime);
  vec3 cool = vec3(0.62, 0.72, 0.87);
  vec3 col = cool * (0.34 + 0.5 * core) * fl;
  float alpha = (0.05 + 0.115 * edge) * edge;
  alpha *= vDim * vAtt * birth;
` + PULSE_BLOCK + `
  col += cool * act * (0.45 + core * 0.95);
  alpha += act * (0.24 + 0.3 * core) * birth;
` + DISSOLVE_BLOCK + `
  frag = vec4(col * alpha, alpha);
}
`;

export const SOMA_VS = GLSL_VERSION + `
layout(location = 7) in vec2 aCorner;
layout(location = 8) in vec3 aPos;
layout(location = 9) in float aSize;
layout(location = 10) in float aSeed;
layout(location = 11) in float aId;
layout(location = 12) in float aDim;
layout(location = 13) in float aBirth;
uniform mat4 uVP;
uniform mat4 uModel;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTime;
out vec2 vUV;
out vec3 vWorld;
flat out float vId;
out float vDim;
out float vSeed;
out float vBirth;
void main(){
  float pop = 0.5 + 0.5 * smoothstep(aBirth, aBirth + 1.4, uTime);
  vec3 world = aPos + (uRight * aCorner.x + uUp * aCorner.y) * aSize * (0.55 + 0.45 * pop);
  gl_Position = uVP * uModel * vec4(world, 1.0);
  vUV = aCorner;
  vWorld = world;
  vId = aId;
  vDim = aDim;
  vSeed = aSeed;
  vBirth = aBirth;
}
`;

export const SOMA_FS = GLSL_VERSION + `
precision highp float;
#define PULSE_WARM vec3(1.0, 0.87, 0.7)
#define PULSE_GAIN 1.0
#define ALPHA_GAIN 0.32
in vec2 vUV;
in vec3 vWorld;
flat in float vId;
in float vDim;
in float vSeed;
in float vBirth;
` + ACT_UNI + `
out vec4 frag;
` + GLSL_LIB + `
void main(){
  float act = uAct[int(vId + 0.5)];
  float r = length(vUV);
  float membrane = smoothstep(1.0, 0.74, r);
  if(membrane < 0.003) discard;
  float cyt = fbm(vec3(vUV * 2.6, vSeed * 31.7));
  vec2 nucOff = vec2(sin(vSeed * 12.9), cos(vSeed * 7.3)) * 0.22;
  float nuc = length(vUV - nucOff);
  vec2 dirV = vUV / max(r, 1e-3);
  float rim = pow(max(dot(dirV, normalize(vec2(-0.55, 0.78))), 0.0), 2.0);
  float ring = smoothstep(0.5, 0.92, r) * smoothstep(1.0, 0.86, r);
  vec3 cool = vec3(0.66, 0.75, 0.89);
  vec3 col = cool * (0.15 + 0.22 * cyt);
  col *= 1.0 - smoothstep(0.0, 0.34, nuc) * 0.38;
  col += cool * ring * 0.5 * (0.5 + 0.5 * cyt);
  col += cool * rim * 0.28;
  float birth = smoothstep(vBirth, vBirth + 1.3, uTime);
  float alpha = membrane * 0.32 * vDim * birth;
` + PULSE_BLOCK + `
  col += PULSE_WARM * exp(-r * r * 4.5) * act * 0.9;
  col += cool * ring * act * 0.85;
  col += cool * rim * act * 0.4;
  alpha += act * (0.2 + 0.24 * ring) * membrane * birth;
` + DISSOLVE_BLOCK + `
  frag = vec4(col * alpha, alpha);
}
`;

export const PARTICLE_VS = GLSL_VERSION + `
layout(location = 14) in vec3 aPos;
layout(location = 15) in float aSize;
layout(location = 16) in float aSeed;
layout(location = 17) in float aAmp;
layout(location = 18) in float aDim;
uniform mat4 uVP;
uniform mat4 uModel;
uniform vec2 uRes;
uniform float uTime;
out vec3 vWorld;
out float vSeed;
out float vDim;
void main(){
  float ph = aSeed * 6.2831853;
  vec3 p = aPos;
  p.x += sin(uTime * 0.11 + ph) * aAmp;
  p.y += sin(uTime * 0.085 + ph * 1.71) * aAmp * 0.8;
  p.z += cos(uTime * 0.07 + ph) * aAmp;
  vec4 cs = uVP * uModel * vec4(p, 1.0);
  gl_Position = cs;
  gl_PointSize = clamp(aSize * (uRes.y * 0.0011) / max(cs.w, 0.1), 1.0, 7.0);
  vWorld = p;
  vSeed = aSeed;
  vDim = aDim * clamp(2.0 - cs.w * 0.6, 0.3, 1.0);
}
`;

export const PARTICLE_FS = GLSL_VERSION + `
precision highp float;
in vec3 vWorld;
in float vSeed;
in float vDim;
` + ACT_UNI + `
out vec4 frag;
` + GLSL_LIB + `
void main(){
  float birth = smoothstep(0.8 + vSeed * 2.2, 1.9 + vSeed * 2.2, uTime);
  float tw = 0.55 + 0.45 * sin(uTime * (0.6 + fract(vSeed * 3.1) * 1.6) + vSeed * 40.0);
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float d = length(pc);
  float disc = smoothstep(1.0, 0.15, d);
  vec3 cool = vec3(0.6, 0.71, 0.87);
  vec3 col = cool * (0.5 + 0.5 * tw);
  float alpha = disc * 0.16 * vDim * tw * birth;
` + DISSOLVE_BLOCK + `
  frag = vec4(col * alpha, alpha);
}
`;
