export default function MilestoneToast({ milestone }) {
  if (!milestone) return null;
  return (
    <div className="milestone-toast" key={milestone.id} role="status">
      <div className="milestone-toast__kicker">新天体出现</div>
      <div className="milestone-toast__label">{milestone.label}</div>
    </div>
  );
}
