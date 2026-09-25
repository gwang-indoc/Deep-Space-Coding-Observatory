import Appear from './Appear.jsx';
import StarCluster from './StarCluster.jsx';
import AsteroidBelt from './AsteroidBelt.jsx';
import GasGiant from './GasGiant.jsx';
import Galaxy from './Galaxy.jsx';
import Pulsar from './Pulsar.jsx';
import BlackHole from './BlackHole.jsx';
import SupernovaRemnant from './SupernovaRemnant.jsx';
import MilkyWay from './MilkyWay.jsx';
import PlanetaryNebula from './PlanetaryNebula.jsx';
import CollidingGalaxies from './CollidingGalaxies.jsx';

// Distant bodies are spread around the full circle so the slowly rotating
// camera brings them into view one at a time instead of crowding one spot.
// `azimuth` is measured from straight ahead of the default camera; the height
// drops with distance so each one sits just above the planetary plane on screen.
function around(azimuthDeg, radius) {
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * radius, 7 - radius * 0.29, -Math.cos(a) * radius];
}

const PLACEMENT = {
  cluster: { Component: StarCluster, position: around(105, 48) },
  asteroids: { Component: AsteroidBelt },
  giant: { Component: GasGiant },
  galaxy: { Component: Galaxy, position: around(-35, 80) },
  pulsar: { Component: Pulsar, position: around(45, 55) },
  blackhole: { Component: BlackHole, position: around(165, 42) },
  remnant: { Component: SupernovaRemnant, position: around(-140, 65) },
  // Spans the whole sky, so it fades itself in instead of growing from a point.
  milkyway: { Component: MilkyWay, appear: false },
  planetary: { Component: PlanetaryNebula, position: around(135, 45) },
  collision: { Component: CollidingGalaxies, position: around(-90, 75) },
};

export const WONDER_IDS = Object.keys(PLACEMENT);

export default function Wonders({ unlocked }) {
  return (
    <group>
      {unlocked.map(({ id }) => {
        const placement = PLACEMENT[id];
        if (!placement) return null;
        const { Component, appear = true, position } = placement;
        return appear ? (
          <Appear key={id} position={position}>
            <Component />
          </Appear>
        ) : (
          <Component key={id} />
        );
      })}
    </group>
  );
}
