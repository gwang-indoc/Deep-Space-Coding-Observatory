import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const COUNT = 1600;
const INNER = 12.8;
const OUTER = 14.4;

// A lumpy rock: an icosahedron with each vertex pushed in or out a little.
function makeRockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(0.7 + Math.abs(Math.sin(v.x * 5.1 + v.y * 3.7 + v.z * 4.3)) * 0.5);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export default function AsteroidBelt() {
  const meshRef = useRef(null);
  const groupRef = useRef(null);
  const geometry = useMemo(() => makeRockGeometry(), []);
  const rocks = useMemo(
    () =>
      Array.from({ length: COUNT }, () => {
        const r = INNER + Math.pow(Math.random(), 0.8) * (OUTER - INNER);
        return {
          angle: Math.random() * Math.PI * 2,
          r,
          y: (Math.random() - 0.5) * 0.5,
          size: 0.015 + Math.pow(Math.random(), 4) * 0.07,
          spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(2),
          // Inner rocks orbit a little faster, as Kepler would have it.
          speed: 0.035 * Math.pow(INNER / r, 1.5),
        };
      }),
    [],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const color = new THREE.Color();
    rocks.forEach((rock, i) => {
      color.setHSL(0.07 + Math.random() * 0.04, 0.18 + Math.random() * 0.15, 0.3 + Math.random() * 0.25);
      meshRef.current.setColorAt(i, color);
    });
    meshRef.current.instanceColor.needsUpdate = true;
  }, [rocks]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    rocks.forEach((rock, i) => {
      rock.angle += rock.speed * delta;
      dummy.position.set(Math.cos(rock.angle) * rock.r, rock.y, Math.sin(rock.angle) * rock.r);
      dummy.rotation.set(rock.spin.x * t, rock.spin.y * t, rock.spin.z * t);
      dummy.scale.setScalar(rock.size);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[geometry, undefined, COUNT]} frustumCulled={false}>
        <meshStandardMaterial roughness={1} metalness={0} flatShading />
      </instancedMesh>
    </group>
  );
}
