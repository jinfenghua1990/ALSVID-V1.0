'use client';

import { useState } from 'react';

export function AdminLogout() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/session/logout', { method: 'POST' });
      if (!response.ok) throw new Error('退出失败，请重试');
      window.location.assign('/login?portal=admin');
    } catch {
      setError('无法退出，请重试');
      setBusy(false);
    }
  }

  return (
    <span>
      <button className="av-btn" type="button" onClick={() => { void signOut(); }} disabled={busy}>
        {busy ? '退出中…' : '退出登录'}
      </button>
      {error ? <small role="alert">{error}</small> : null}
    </span>
  );
}
