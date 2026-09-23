export default function ModeBanner({ mode, message }) {
  if (mode === 'active') return null;

  if (mode === 'waiting') {
    return (
      <div className="mode-banner mode-banner--waiting" data-testid="mode-banner" data-mode="waiting" role="alert">
        <div className="mode-banner__title">AWAITING INPUT</div>
        <div className="mode-banner__subtitle">需要你的输入</div>
        {message && <div className="mode-banner__message">{message}</div>}
      </div>
    );
  }

  return (
    <div className="mode-banner mode-banner--idle" data-testid="mode-banner" data-mode="idle">
      <div className="mode-banner__title">IDLE</div>
      <div className="mode-banner__subtitle">等待新任务</div>
    </div>
  );
}
