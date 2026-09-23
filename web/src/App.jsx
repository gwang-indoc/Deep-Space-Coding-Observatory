import { OrbitProvider, useOrbit } from './state/OrbitProvider.jsx';
import Scene from './scene/Scene.jsx';
import CentralStar from './scene/CentralStar.jsx';
import IdleUniverse from './scene/IdleUniverse.jsx';
import PlanetLayer from './scene/PlanetLayer.jsx';
import Satellites from './scene/Satellites.jsx';
import Ship from './scene/Ship.jsx';
import RadarPing from './scene/RadarPing.jsx';
import Nebula from './scene/Nebula.jsx';
import StatusHud from './hud/StatusHud.jsx';
import StepList from './hud/StepList.jsx';

function OrbitDashboard() {
  const { orbitState, lastStatus, renderingPaused, activeStep, recentLog } = useOrbit();

  return (
    <div data-testid="orbit-app" style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Scene missionActive={orbitState.missionActive} renderingPaused={renderingPaused}>
        <IdleUniverse />
        <Nebula waitingSince={orbitState.waitingSince} />
        <CentralStar missionActive={orbitState.missionActive} lastCompletedAt={orbitState.lastCompletedAt} />
        <PlanetLayer todos={orbitState.todos} />
        <Satellites satellites={orbitState.satellites} />
        <Ship ships={orbitState.ships} testResultRing={orbitState.testResultRing} />
        <RadarPing radarPings={orbitState.radarPings} />
      </Scene>
      <StatusHud lastStatus={lastStatus} />
      <StepList activeStep={activeStep} recentLog={recentLog} />
    </div>
  );
}

export default function App() {
  return (
    <OrbitProvider>
      <OrbitDashboard />
    </OrbitProvider>
  );
}
