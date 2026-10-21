'use strict';

const form = document.getElementById('unlock-form');
const button = document.getElementById('unlock-button');
const status = document.getElementById('status');
const password = document.getElementById('password');

const workerReady = (async () => {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !window.crypto?.subtle || !window.DecompressionStream) {
    throw new Error('このブラウザでは開けません。最新のChromeまたはEdgeの通常ウィンドウをお使いください。');
  }
  await navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' });
  return navigator.serviceWorker.ready;
})();

workerReady.catch(error => { status.textContent = error.message; button.disabled = true; });

form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = 'ギャラリーを開いています…';
  try {
    const registration = await workerReady;
    const result = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error('読み込みがタイムアウトしました。接続を確認して、もう一度お試しください。')), 90000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      registration.active.postMessage({ type: 'unlock', password: password.value }, [channel.port2]);
    });
    password.value = '';
    if (!result.ok) throw new Error(result.message);
    const base = new URL(registration.scope);
    const requested = new URLSearchParams(location.search).get('next');
    const target = requested ? new URL(requested, base) : base;
    location.replace(target.origin === base.origin && target.pathname.startsWith(base.pathname) ? target.href : base.href);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
    password.focus();
  }
});
