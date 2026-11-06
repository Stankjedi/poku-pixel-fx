/** View controls are independent of native coordinates and saved artwork. */
export function installPixelArtViewport() {
  const zoom = document.getElementById('zoom') as HTMLSelectElement;
  const levels = [1, 2, 4, 8, 16, 32];
  function changeZoom(direction: number, host?: HTMLElement, at?: { x: number; y: number }) {
    const canvas = (host?.querySelector('canvas#source,canvas#result') ?? document.getElementById('result')) as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect(), current = zoom.value === 'auto' ? rect.width / canvas.width : Number(zoom.value);
    const next = direction > 0 ? levels.find(n => n > current) ?? levels.at(-1)! : [...levels].reverse().find(n => n < current) ?? 1;
    const anchor = at ? { x: (at.x - rect.left) / rect.width, y: (at.y - rect.top) / rect.height } : undefined;
    zoom.value = String(next); zoom.dispatchEvent(new Event('change'));
    if (host && at && anchor) requestAnimationFrame(() => {
      const after = canvas.getBoundingClientRect();
      host.scrollLeft += after.left + anchor.x * after.width - at.x;
      host.scrollTop += after.top + anchor.y * after.height - at.y;
    });
  }
  for (const id of ['source-host', 'result-host']) {
    const host = document.getElementById(id)!;
    let pan: { id: number; x: number; y: number; left: number; top: number } | undefined;
    host.addEventListener('pointerdown', event => {
      if (event.button !== 1) return;
      event.preventDefault(); pan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: host.scrollLeft, top: host.scrollTop };
      host.setPointerCapture(event.pointerId); host.classList.add('panning');
    });
    host.addEventListener('pointermove', event => {
      if (!pan || pan.id !== event.pointerId) return;
      host.scrollLeft = pan.left + pan.x - event.clientX; host.scrollTop = pan.top + pan.y - event.clientY;
    });
    const release = () => { const previous = pan; pan = undefined; host.classList.remove('panning'); if (previous && host.hasPointerCapture(previous.id)) host.releasePointerCapture(previous.id); };
    host.addEventListener('pointerup', release); host.addEventListener('pointercancel', release); host.addEventListener('lostpointercapture', release);
    host.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); changeZoom(event.deltaY < 0 ? 1 : -1, host, { x: event.clientX, y: event.clientY });
    }, { passive: false });
  }
  window.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(1); }
    if (event.key === '-') { event.preventDefault(); changeZoom(-1); }
    if (event.key === '1') { event.preventDefault(); zoom.value = '1'; zoom.dispatchEvent(new Event('change')); }
    if (event.key === '[' || event.key === ']') {
      event.preventDefault(); const size = document.getElementById('paint-size') as HTMLInputElement;
      size.value = String(Math.max(1, Math.min(64, Number(size.value) + (event.key === '[' ? -1 : 1))));
    }
  });
}
