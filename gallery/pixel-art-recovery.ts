export interface PixelArtRecoverySnapshot {
  json: string;
  name: string;
  frames: number;
}

interface RecoveryHost {
  snapshot(): PixelArtRecoverySnapshot;
  /** Validate and render the complete candidate before replacing any editor state. */
  restore(json: string): void;
  /** Finish pending edits, or throw if another asynchronous import is in progress. */
  finish(): void;
}
interface RecoverySummary {
  id: string;
  name: string;
  frames: number;
  updatedAt: number;
  bytes: number;
}
interface RecoveryRecord extends RecoverySummary { schema: 'poku-pixel-art-recovery/v1'; json: string }

const DB_NAME = 'poku-pixel-art-recovery', SESSION_KEY = 'poku-pixel-art-recovery-tab';
const MAX_BYTES = 64 * 1024 * 1024;
const makeId = () => crypto.randomUUID();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    let rejected = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore('drafts', { keyPath: 'id' });
      request.result.createObjectStore('summaries', { keyPath: 'id' });
    };
    request.onerror = () => { rejected = true; reject(request.error ?? new Error('브라우저 저장 공간을 열 수 없습니다.')); };
    request.onblocked = () => { rejected = true; reject(new Error('다른 창에서 저장 공간을 사용 중입니다. 페이지를 다시 열어 주세요.')); };
    request.onsuccess = () => {
      // A blocked open request cannot be cancelled. Do not leak its eventual handle.
      if (rejected) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    let failure: DOMException | Error | null = null;
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('브라우저 자동 저장에 실패했습니다.'));
    transaction.onerror = event => {
      failure ??= (event.target as IDBRequest).error ?? transaction.error;
      event.preventDefault();
      // Completion is reported only after the transaction has actually rolled back.
      try { transaction.abort(); } catch { /* An abort may already be in progress. */ }
    };
  });
}
async function mutateDatabase(database: IDBDatabase, enqueue: (transaction: IDBTransaction) => void): Promise<void> {
  const transaction = database.transaction(['drafts', 'summaries'], 'readwrite');
  const done = transactionDone(transaction);
  try { enqueue(transaction); }
  catch (error) {
    // A synchronous second put/delete failure does not abort the first queued request.
    try { transaction.abort(); } catch { /* The transaction may already have aborted. */ }
    await done.catch(() => undefined);
    throw error;
  }
  await done;
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('복구본을 읽을 수 없습니다.'));
  });
}

function snapshotBytes(snapshot: PixelArtRecoverySnapshot): number {
  if (typeof snapshot.json !== 'string' || snapshot.json.length > MAX_BYTES)
    throw new RangeError('복구본은 64 MiB 이하로 저장할 수 있습니다.');
  const bytes = new TextEncoder().encode(snapshot.json).byteLength;
  if (bytes > MAX_BYTES) throw new RangeError('복구본은 64 MiB 이하로 저장할 수 있습니다.');
  if (typeof snapshot.name !== 'string' || !snapshot.name || snapshot.name.length > 160 || !Number.isInteger(snapshot.frames) || snapshot.frames < 1)
    throw new RangeError('복구본 이름과 프레임 정보가 올바르지 않습니다.');
  return bytes;
}

/** Every page has a new writer ID, so reloads and duplicated tabs retain their earlier
 * records. All mutations share one queue. Each automatic operation captures only one
 * completed snapshot and never finishes a path. Restore first preserves the current
 * editor in a separate record, then replaces it with the validated candidate. */
export function installPixelArtRecovery(host: RecoveryHost) {
  const panel = document.createElement('section'); panel.className = 'recovery-panel'; panel.setAttribute('aria-label', '작업 자동 저장과 복구');
  const row = document.createElement('div'); row.className = 'inline-controls';
  const label = document.createElement('label'); label.className = 'inline';
  const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.id = 'recovery-enabled'; enabled.checked = true;
  label.append(enabled, '이 브라우저에 자동 저장');
  const status = document.createElement('span'); status.id = 'recovery-status'; status.className = 'hint'; status.setAttribute('role', 'status');
  const save = document.createElement('button'); save.id = 'save-recovery-now'; save.textContent = '복구본 지금 저장'; save.disabled = true;
  row.append(label, save, status);
  const controls = document.createElement('div'); controls.className = 'inline-controls'; controls.hidden = true;
  const select = document.createElement('select'); select.id = 'recovery-list'; select.setAttribute('aria-label', '저장된 복구본');
  const restore = document.createElement('button'); restore.id = 'restore-recovery'; restore.textContent = '선택한 작업 복구';
  const remove = document.createElement('button'); remove.id = 'delete-recovery'; remove.textContent = '선택한 복구본 삭제';
  controls.append(select, restore, remove);
  const note = document.createElement('p'); note.className = 'hint';
  note.textContent = '완료한 편집을 잠시 뒤 저장합니다. 복구하기 전의 작업도 별도 복구본으로 보존합니다. 다른 기기에서도 열려면 프로젝트 파일을 저장하세요.';
  panel.append(row, controls, note); document.querySelector('.intro')!.after(panel);

  let preferredId: string | null = null, writer = makeId();
  try { preferredId = sessionStorage.getItem(SESSION_KEY); } catch { /* The fresh in-memory writer remains isolated. */ }
  let database: IDBDatabase | undefined, revision = 0, savedRevision = 0;
  let timer = 0, ready = false, restorePending = false, replacing = false, removing = false, automaticQueued = false;
  let operations: Promise<void> = Promise.resolve();
  const setStatus = (message: string, state = 'idle') => { status.textContent = message; status.dataset.state = state; };
  const errorText = (error: unknown) => error instanceof DOMException && error.name === 'QuotaExceededError'
    ? '저장 공간이 부족합니다. 프로젝트 파일을 저장하거나 이전 복구본을 정리해 주세요.'
    : `복구본을 처리할 수 없습니다. 프로젝트 파일로 저장해 주세요. ${error instanceof Error ? error.message : String(error)}`;
  const clearTimer = () => { clearTimeout(timer); timer = 0; };
  function remember(id: string) {
    preferredId = id;
    try { sessionStorage.setItem(SESSION_KEY, id); } catch { /* Storage permission is optional. */ }
  }
  function forget(id: string) {
    if (preferredId !== id) return;
    preferredId = null;
    try { if (sessionStorage.getItem(SESSION_KEY) === id) sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage permission is optional. */ }
  }
  function syncControls() {
    save.disabled = !ready || restorePending;
    enabled.disabled = !ready || restorePending;
    select.disabled = restorePending || removing;
    restore.disabled = remove.disabled = !ready || restorePending || removing || !select.value;
  }
  async function refreshList(preferred?: string) {
    if (!database) return;
    const summaries = await result(database.transaction('summaries').objectStore('summaries').getAll()) as RecoverySummary[];
    summaries.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    const current = preferred ?? select.value;
    select.replaceChildren(...summaries.map(summary => {
      const option = document.createElement('option'); option.value = summary.id;
      option.textContent = `${summary.name} · ${summary.frames > 1 ? summary.frames + '프레임 · ' : ''}${new Date(summary.updatedAt).toLocaleString()}`;
      return option;
    }));
    if (summaries.some(summary => summary.id === current)) select.value = current;
    controls.hidden = !summaries.length;
    syncControls();
  }
  function enqueue(operation: () => Promise<boolean>): Promise<boolean> {
    const next = operations.then(async () => {
      await initialize;
      try { return await operation(); }
      catch (error) { setStatus(errorText(error), 'error'); return false; }
    });
    operations = next.then(() => undefined);
    return next;
  }
  function scheduleAutomatic() {
    clearTimer();
    if (!ready || !enabled.checked || restorePending || revision <= savedRevision) return;
    timer = window.setTimeout(() => { timer = 0; void automaticSave(); }, 900);
  }
  function changed() {
    if (replacing) return;
    revision++;
    if (!ready || !enabled.checked || restorePending) return;
    setStatus('편집 내용 자동 저장 대기 중', 'pending');
    scheduleAutomatic();
  }
  async function putSnapshot(id: string, snapshot: PixelArtRecoverySnapshot): Promise<RecoverySummary> {
    const summary: RecoverySummary = { id, name: snapshot.name, frames: snapshot.frames, updatedAt: Date.now(), bytes: snapshotBytes(snapshot) };
    const record: RecoveryRecord = { ...summary, schema: 'poku-pixel-art-recovery/v1', json: snapshot.json };
    await mutateDatabase(database!, transaction => {
      transaction.objectStore('drafts').put(record);
      transaction.objectStore('summaries').put(summary);
    });
    return summary;
  }
  async function saveSnapshot(automatic: boolean): Promise<boolean> {
    if (!ready || !database) return false;
    // Check when the queued operation starts. Switching autosave off lets an existing
    // transaction finish but prevents further automatic snapshots from being captured.
    if (automatic && (!enabled.checked || restorePending || revision <= savedRevision)) return true;
    if (!automatic) { host.finish(); clearTimer(); }
    const target = revision, snapshot = host.snapshot(), id = writer;
    if (!restorePending) setStatus('편집 내용 저장 중…', 'saving');
    const summary = await putSnapshot(id, snapshot);
    savedRevision = target;
    // Do not replace the reload pointer until this writer has a committed record.
    remember(id);
    await refreshList(id);
    if (!restorePending) {
      if (revision > savedRevision && enabled.checked) setStatus('새 편집 내용 자동 저장 대기 중', 'pending');
      else setStatus(`${automatic && enabled.checked ? '자동 저장' : '복구본 저장'} 완료 · ${new Date(summary.updatedAt).toLocaleTimeString()}${enabled.checked ? '' : ' · 자동 저장 꺼짐'}`, 'saved');
    }
    return true;
  }
  function automaticSave(): Promise<boolean> {
    clearTimer();
    if (automaticQueued) return Promise.resolve(true);
    automaticQueued = true;
    return enqueue(async () => { automaticQueued = false; return saveSnapshot(true); });
  }
  /** Explicit saves always write, including when another tab deleted our old record. */
  function flush(): Promise<boolean> { clearTimer(); return enqueue(() => saveSnapshot(false)); }

  function freezeEditor(): () => void {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.layout, .intro'));
    const previous = sections.map(section => section.inert);
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    for (const section of sections) section.inert = true;
    panel.setAttribute('aria-busy', 'true');
    // inert alone does not block window shortcuts or a canvas's captured pointer.
    // Pointerup/cancel still pass so an older selection gesture can release normally.
    const blockedEvents = ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointermove', 'click', 'dblclick', 'contextmenu', 'beforeinput', 'paste', 'drop'] as const;
    const block = (event: Event) => { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation(); };
    for (const type of blockedEvents) window.addEventListener(type, block, { capture: true, passive: false });
    return () => {
      for (const type of blockedEvents) window.removeEventListener(type, block, true);
      sections.forEach((section, i) => { section.inert = previous[i]; });
      panel.removeAttribute('aria-busy');
      if (focused?.isConnected && !focused.closest('[inert]')) focused.focus({ preventScroll: true });
    };
  }
  const initialize = (async () => {
    try {
      database = await openDatabase();
      database.onversionchange = () => {
        database!.close(); ready = false; clearTimer(); syncControls();
        setStatus('브라우저 저장 공간이 변경되었습니다. 페이지를 다시 열어 주세요.', 'error');
      };
      await refreshList(preferredId ?? undefined); ready = true; syncControls();
      setStatus(select.options.length ? '이 브라우저에 복구할 작업이 있습니다.' : '완료한 편집을 자동으로 저장합니다.');
      scheduleAutomatic();
    } catch (error) { setStatus(errorText(error), 'error'); syncControls(); }
  })();
  syncControls();
  select.onchange = syncControls;
  enabled.onchange = () => {
    if (enabled.checked) { setStatus('자동 저장을 켰습니다.'); scheduleAutomatic(); }
    else { clearTimer(); setStatus('자동 저장을 껐습니다. 기존 복구본은 유지됩니다.'); }
  };
  save.onclick = () => { void flush(); };
  restore.onclick = () => {
    if (!ready || !database || !select.value || restorePending || removing) return;
    const id = select.value;
    // Finish before making the canvas inert: losing capture must not cancel the edit
    // that the backup is meant to preserve. The host also rejects pending imports.
    try { host.finish(); }
    catch (error) { setStatus(errorText(error), 'error'); return; }
    restorePending = true; clearTimer(); syncControls();
    const thaw = freezeEditor();
    setStatus('복구 준비 중 · 현재 작업을 먼저 보존합니다.', 'restoring');
    void enqueue(async () => {
      if (!ready || !database) return false;
      const record = await result(database.transaction('drafts').objectStore('drafts').get(id)) as RecoveryRecord | undefined;
      if (!record || record.id !== id || record.schema !== 'poku-pixel-art-recovery/v1') throw new Error('선택한 복구본을 읽을 수 없습니다.');
      snapshotBytes(record);
      host.finish();
      const target = revision, backup = makeId();
      // A new ID preserves both the selected original and the current editor, even
      // when the selected recovery itself belongs to this writer.
      await putSnapshot(backup, host.snapshot());
      savedRevision = target; remember(backup);
      // Keep the backup discoverable even when the candidate later fails validation.
      await refreshList(id);
      if (revision !== target) throw new Error('복구를 준비하는 동안 작업이 변경되었습니다. 현재 작업을 확인한 뒤 다시 복구해 주세요.');
      replacing = true;
      try { host.restore(record.json); } finally { replacing = false; }
      writer = makeId(); revision = savedRevision = 0;
      // Until the first new edit is saved, reload should prefer the selected original.
      remember(id);
      setStatus(`${record.name} 복구 완료 · 이전 작업도 별도 복구본으로 보존했습니다.`, 'restored');
      return true;
    }).finally(() => {
      restorePending = false; syncControls(); thaw(); scheduleAutomatic();
    });
  };
  remove.onclick = () => {
    if (!ready || !database || !select.value || restorePending || removing) return;
    const id = select.value;
    removing = true; syncControls();
    if (id === writer) clearTimer();
    void enqueue(async () => {
      if (!ready || !database) return false;
      const deletedRevision = revision;
      await mutateDatabase(database, transaction => {
        transaction.objectStore('drafts').delete(id);
        transaction.objectStore('summaries').delete(id);
      });
      // Deletion stays deleted until a later edit or explicit save. Edits made while
      // this transaction was pending have a higher revision and keep their debounce.
      if (id === writer) savedRevision = deletedRevision;
      forget(id);
      await refreshList();
      setStatus('선택한 복구본을 삭제했습니다. 현재 그림은 유지됩니다.');
      return true;
    }).finally(() => { removing = false; syncControls(); });
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && enabled.checked && revision > savedRevision) void automaticSave(); });
  window.addEventListener('pagehide', () => { if (enabled.checked && revision > savedRevision) void automaticSave(); });
  return { changed, flush, ready: initialize };
}
