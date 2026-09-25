import { useEffect, useMemo, useState } from 'react';
import { OrbitProvider, useOrbit } from './state/OrbitProvider.jsx';
import { selectActiveMs, selectOrbitMode } from './state/orbitReducer.js';
import { MILESTONES, unlockedMilestones } from './state/milestones.js';
import { unlockedPlanetCount } from './state/planets.js';
import Scene from './scene/Scene.jsx';
import CentralStar from './scene/CentralStar.jsx';
import IdleUniverse from './scene/IdleUniverse.jsx';
import PlanetLayer from './scene/PlanetLayer.jsx';
import Satellites from './scene/Satellites.jsx';
import Ship from './scene/Ship.jsx';
import RadarPing from './scene/RadarPing.jsx';
import Nebula from './scene/Nebula.jsx';
import Comets from './scene/Comets.jsx';
import Wonders from './scene/wonders/Wonders.jsx';
import StatusHud from './hud/StatusHud.jsx';
import StepList from './hud/StepList.jsx';
import ModeBanner from './hud/ModeBanner.jsx';
import { useTabTitle } from './hud/useTabTitle.js';
import UptimeHud from './hud/UptimeHud.jsx';
import MilestoneToast from './hud/MilestoneToast.jsx';
import TerminalPanel from './hud/TerminalPanel.jsx';
import { useMilestoneToast } from './hud/useMilestoneToast.js';

// Mode depends on time (the completion flash expires), so re-evaluate it periodically.
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function OrbitDashboard() {
  const { orbitState, lastStatus, renderingPaused, activeStep, recentLog, transcriptEntries } = useOrbit();
  const now = useNow(500);
  const mode = selectOrbitMode(orbitState, now);
  useTabTitle(mode);
  const activeMs = selectActiveMs(orbitState, now);
  const unlockedCount = unlockedMilestones(activeMs).length;
  // Milestones are ordered, so the unlocked set is a prefix; keying on its length
  // keeps the array stable between ticks so the scene and toast don't churn.
  const unlocked = useMemo(() => MILESTONES.slice(0, unlockedCount), [unlockedCount]);
  const toast = useMilestoneToast(unlocked);
  const planetCount = unlockedPlanetCount(activeMs);

  return (
    <div data-testid="orbit-app" data-mode={mode} className="orbit-app" style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div className="orbit-stage">
        <Scene renderingPaused={renderingPaused} mode={mode}>
          <IdleUniverse />
          <Nebula waitingSince={orbitState.waitingSince} />
          <Comets />
          <Wonders unlocked={unlocked} />
          <CentralStar mode={mode} lastCompletedAt={orbitState.lastCompletedAt} />
          <PlanetLayer count={planetCount} running={mode === 'active'} />
          <Satellites satellites={orbitState.satellites} />
          <Ship ships={orbitState.ships} testResultRing={orbitState.testResultRing} />
          <RadarPing radarPings={orbitState.radarPings} />
        </Scene>
      </div>
      <div className="mode-frame" aria-hidden="true" />
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
        <div className="mode-banner-slot">
          <ModeBanner mode={mode} message={orbitState.waitingMessage} />
        </div>
        <div style={{ position: 'absolute', top: 16, right: 16, pointerEvents: 'auto' }}>
          <StatusHud lastStatus={lastStatus} />
        </div>
        <div style={{ position: 'absolute', bottom: 16, left: 16, pointerEvents: 'auto' }}>
          <StepList activeStep={activeStep} recentLog={recentLog} />
        </div>
        <div style={{ position: 'absolute', bottom: 16, right: 16, pointerEvents: 'auto' }}>
          <UptimeHud activeMs={activeMs} />
        </div>
        <div className="milestone-toast-slot">
          <MilestoneToast milestone={toast} />
        </div>
        <TerminalPanel entries={transcriptEntries} />
      </div>
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
