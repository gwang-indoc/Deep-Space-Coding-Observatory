export default function ModeBanner({ mode, message, notifyPermission, onEnableNotify }) {
  if (mode === 'active') return null;

  const notifyButton =
    notifyPermission === 'default' ? (
      <button type="button" className="mode-banner__notify" onClick={onEnableNotify}>
        开启桌面通知
      </button>
    ) : null;

  if (mode === 'waiting') {
    return (
      <div className="mode-banner mode-banner--waiting" data-testid="mode-banner" data-mode="waiting" role="alert">
        <div className="mode-banner__title">AWAITING INPUT</div>
        <div className="mode-banner__subtitle">需要你的输入</div>
        {message && <div className="mode-banner__message">{message}</div>}
        {notifyButton}
      </div>
    );
  }

  return (
    <div className="mode-banner mode-banner--idle" data-testid="mode-banner" data-mode="idle">
      <div className="mode-banner__title">IDLE</div>
      <div className="mode-banner__subtitle">等待新任务</div>
      {notifyButton}
    </div>
  );
}
