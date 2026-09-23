import * as THREE from 'three';

// Points material with per-vertex color, size and alpha, soft round sprites,
// additive blending and optional twinkle. Shared by the starfield and comet tails.
export function createGlowPointsMaterial({ twinkle = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTwinkle: { value: twinkle },
      uScale: { value: 300 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float alpha;
      attribute float phase;
      uniform float uTime;
      uniform float uTwinkle;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        float flicker = 1.0 - uTwinkle * 0.5 * (1.0 + sin(uTime * (1.5 + phase * 3.0) + phase * 40.0));
        vAlpha = alpha * flicker;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uScale / -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv) * 2.0;
        if (d > 1.0) discard;
        float core = exp(-d * d * 6.0);
        float halo = (1.0 - d) * 0.25;
        gl_FragColor = vec4(vColor * (core + halo) * 1.4, (core + halo) * vAlpha);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}
