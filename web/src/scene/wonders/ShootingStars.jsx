import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGlowPointsMaterial } from '../glowPoints.js';

const METEORS = 3;
const TRAIL = 36;
const LIFETIME_S = 0.9;
const SPEED = 38;

// Occasional meteors streaking across whatever part of the sky the camera faces.
export default function ShootingStars() {
  const material = useMemo(() => createGlowPointsMaterial(), []);
  const scratch = useMemo(() => ({ forward: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() }), []);
  const meteors = useMemo(
    () => Array.from({ length: METEORS }, (_, i) => ({ age: LIFETIME_S, wait: 1 + i * 2.5, head: new THREE.Vector3(), dir: new THREE.Vector3() })),
    [],
  );

  const geometry = useMemo(() => {
    const count = METEORS * TRAIL;
    const g = new THREE.BufferGeometry();
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const hot = new THREE.Color('#fff6e0');
    const cool = new THREE.Color('#7fb8ff');
    for (let i = 0; i < count; i += 1) {
      const t = (i % TRAIL) / TRAIL;
      const c = hot.clone().lerp(cool, t);
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = 0.9 * (1 - t) + 0.1;
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(count), 1));
    g.setAttribute('phase', new THREE.BufferAttribute(new Float32Array(count), 1));
    return g;
  }, []);

  useFrame(({ camera }, delta) => {
    const positions = geometry.attributes.position;
    const alphas = geometry.attributes.alpha;
    camera.getWorldDirection(scratch.forward);
    scratch.right.crossVectors(scratch.forward, camera.up).normalize();
    scratch.up.crossVectors(scratch.right, scratch.forward).normalize();

    meteors.forEach((m, mi) => {
      if (m.age >= LIFETIME_S) {
        m.wait -= delta;
        if (m.wait <= 0) {
          const side = Math.random() < 0.5 ? -1 : 1;
          m.head
            .copy(camera.position)
            .addScaledVector(scratch.forward, 35 + Math.random() * 15)
            .addScaledVector(scratch.right, (Math.random() - 0.5) * 50)
            .addScaledVector(scratch.up, 4 + Math.random() * 14);
          m.dir.copy(scratch.right).multiplyScalar(-side).addScaledVector(scratch.up, -0.5 - Math.random() * 0.5).normalize();
          m.age = 0;
          m.wait = 2 + Math.random() * 5;
        }
      } else {
        m.age += delta;
        m.head.addScaledVector(m.dir, SPEED * delta);
      }
      const life = Math.min(1, m.age / LIFETIME_S);
      const fade = m.age >= LIFETIME_S ? 0 : Math.sin(life * Math.PI);
      for (let i = 0; i < TRAIL; i += 1) {
        const idx = mi * TRAIL + i;
        const back = (i / TRAIL) * 4.5;
        positions.setXYZ(idx, m.head.x - m.dir.x * back, m.head.y - m.dir.y * back, m.head.z - m.dir.z * back);
        alphas.setX(idx, fade * (1 - i / TRAIL));
      }
    });
    positions.needsUpdate = true;
    alphas.needsUpdate = true;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
