import { useState } from 'react';

const STEPS = [
  { key: 'planning', label: 'Planning' },
  { key: 'reading', label: 'Reading' },
  { key: 'editing', label: 'Editing' },
  { key: 'testing', label: 'Testing' },
];

export default function StepList({ activeStep, recentLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="step-list"
      data-testid="step-list"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <ul className="step-list__steps">
        {STEPS.map((step) => (
          <li key={step.key} data-active={String(step.key === activeStep)}>
            {step.label}
          </li>
        ))}
      </ul>
      {expanded && (
        <ul className="step-list__log">
          {recentLog.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
