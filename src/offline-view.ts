import type { AppContext } from './app-api';
import './offline.css';
import { checkOfflineCache, lastServiceWorkerUpdate, prepareOfflineCache, serviceWorkerVersion } from './sw-register';
import { exportVaultBackup, getAttachment, getPrivateCard, importVaultBackup, listAttachments, removeAttachment, savePrivateCard, storeAttachment, vaultUsage, type AttachmentPurpose, type PrivateCard, type VaultAttachmentMeta } from './vault';

const backupKey = `asia-trip-last-backup:${new URL(import.meta.env.BASE_URL, location.href).pathname}`;
const e = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const errorText = (value: unknown, fallback: string) => value instanceof Error ? value.message : value && typeof value === 'object' && 'message' in value ? String(value.message) : fallback;
const formatBytes = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Todavía no disponible';
const labels: Record<AttachmentPurpose, string> = { document: 'Reserva o documento', photo: 'Foto del diario', receipt: 'Justificante de gasto' };

export function mountOffline(element: HTMLElement, app: AppContext): void {
  let files: VaultAttachmentMeta[] = [];
  let status = '';
  let busy = false;
  let ready = false;
  let swVersion = 'Consultando…';
  let cacheState = 'Aún no comprobada';
  let persistent = 'No disponible';
  let updatedAt = lastServiceWorkerUpdate();
  let backupAt: string | null = null;
  let privateCard: PrivateCard = { insurer: '', assistancePhone: '', policyReference: '', emergencyContact: '', note: '' };

  function render() {
    const used = files.reduce((sum, item) => sum + item.size, 0);
    const currentState = app.getState();
    const rows = files.length ? `<ul class="vault-list">${files.map(file => {
      const linked = currentState.notes.some(note => note.photoId === file.id) || currentState.expenses.some(expense => expense.receiptId === file.id);
      return `<li><div class="vault-file"><strong>${e(file.name)}</strong><span>${e(labels[file.purpose])} · ${e(file.type.toUpperCase().replace('APPLICATION/', ''))} · ${formatBytes(file.size)}</span></div><div class="actions"><button class="button compact" type="button" data-vault-action="open" data-id="${e(file.id)}">Descargar</button><button class="button compact danger" type="button" data-vault-action="delete" data-id="${e(file.id)}"${linked ? ' disabled title="Este archivo está vinculado a un recuerdo o gasto."' : ''}>Eliminar</button></div></li>`;
    }).join('')}</ul>` : '<div class="vault-empty">Todavía no hay archivos guardados en este dispositivo.</div>';
    element.innerHTML = `<section class="offline-view">
      <header class="page-heading"><div><p class="eyebrow">ASIA TRIP · USO SIN CONEXIÓN</p><h1>Offline y documentos</h1><p>Diagnóstico de recursos y archivos privados que solo se guardan en este navegador.</p></div></header>
      <section class="card offline-diagnostics" aria-labelledby="offline-diagnostics-heading"><div class="section-line"><h2 id="offline-diagnostics-heading">Estado del dispositivo</h2><button class="button compact" type="button" data-vault-action="refresh">Comprobar</button></div>
        <dl class="offline-facts"><div><dt>Conexión</dt><dd>${navigator.onLine ? 'Con conexión' : 'Sin conexión'}</dd></div><div><dt>Service worker</dt><dd>${'serviceWorker' in navigator ? (navigator.serviceWorker.controller ? 'Controlando esta página' : 'Instalado o pendiente de activar') : 'No disponible en este navegador'}</dd></div><div><dt>Versión instalada</dt><dd>${e(swVersion)}</dd></div><div><dt>Recursos precargados</dt><dd>${e(cacheState)}</dd></div><div><dt>Última actualización</dt><dd>${e(dateTime(updatedAt))}</dd></div><div><dt>Última copia JSON</dt><dd>${e(dateTime(backupAt))}</dd></div><div><dt>Almacenamiento persistente</dt><dd>${e(persistent)}</dd></div><div><dt>Archivos locales</dt><dd>${files.length} · ${formatBytes(used)} de 100 MB</dd></div></dl>
        <div class="actions"><button class="button primary" type="button" data-vault-action="prepare"${busy ? ' disabled' : ''}>${busy ? 'Comprobando…' : 'Preparar viaje sin conexión'}</button><button class="button" type="button" data-vault-action="persist">Solicitar almacenamiento persistente</button></div>
        <p class="muted">La comprobación confirma que los recursos de la aplicación estén en caché; no comprueba internet de terceros ni contenido externo. El sistema operativo puede borrar la caché o los archivos locales. Guarda copias de seguridad fuera del teléfono.</p>
      </section>
      <section class="card private-vault" aria-labelledby="vault-heading"><div class="section-line"><div><h2 id="vault-heading">Reservas, documentos y seguro</h2><p>PDF e imágenes se guardan localmente en IndexedDB. No se suben a ningún servidor ni se incluyen en la copia JSON normal.</p></div><span class="tag">Privado en este dispositivo</span></div>
        <section class="private-card" aria-labelledby="private-card-heading"><h3 id="private-card-heading">Datos privados del seguro y reservas</h3><p class="muted">Solo se guardan en este dispositivo y no se comparten con los datos del viaje. El almacenamiento local no está cifrado; guarda solo la información que necesites tener a mano.</p><form data-private-card><div class="form-grid"><label class="field"><span>Aseguradora</span><input name="insurer" maxlength="200" value="${e(privateCard.insurer)}"></label><label class="field"><span>Teléfono de asistencia</span><input name="assistancePhone" maxlength="100" inputmode="tel" value="${e(privateCard.assistancePhone)}"></label><label class="field"><span>Referencia de póliza</span><input name="policyReference" maxlength="200" value="${e(privateCard.policyReference)}"></label><label class="field"><span>Teléfono de contacto de emergencia</span><input name="emergencyContact" maxlength="100" inputmode="tel" value="${e(privateCard.emergencyContact)}"></label></div><label class="field"><span>Nota útil (sin datos médicos)</span><textarea name="note" maxlength="1000">${e(privateCard.note)}</textarea></label><button class="button" type="submit">Guardar datos privados</button></form></section>
        <label class="field"><span>Guardar archivo desde el teléfono</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" data-vault-action="upload"${ready ? '' : ' disabled'}><small>PDF, JPEG, PNG o WebP. Hasta 25 MB por PDF y 15 MB por imagen. Las imágenes se reducen para ahorrar espacio.</small></label>
        ${rows}
        <div class="actions"><button class="button" type="button" data-vault-action="export-vault"${ready ? '' : ' disabled'}>Exportar copia de la bóveda</button><label class="button file-button">Importar copia de la bóveda<input class="sr-only" type="file" accept="application/json,.json" data-vault-action="import-vault"${ready ? '' : ' disabled'}></label></div>
        <p class="muted">Una copia de la bóveda incluye los archivos y estos datos privados en un JSON aparte, sin cifrado. Guárdala en una ubicación privada y segura. El sistema puede eliminar datos locales; conserva una copia en otro lugar. Exportar una copia no borra los archivos guardados.</p>
      </section>
      ${status ? `<p class="storage-warning" role="status">${e(status)}</p>` : ''}
    </section>`;
  }

  async function refresh() {
    try {
      try { backupAt = localStorage.getItem(backupKey); } catch { backupAt = null; }
      [files, privateCard] = await Promise.all([listAttachments(), getPrivateCard()]);
      swVersion = await serviceWorkerVersion() ?? 'No disponible';
      const [cache, usage, persistence] = await Promise.all([
        checkOfflineCache().catch(() => null),
        vaultUsage(),
        navigator.storage?.persisted().catch(() => false) ?? Promise.resolve(false),
      ]);
      cacheState = cache ? `${cache.cached}/${cache.total} recursos${cache.complete ? ' · lista para offline' : ` · faltan ${cache.missing}`}` : 'No se pudo consultar';
      persistent = persistence ? 'Protegido frente a limpieza automática' : navigator.storage ? 'No solicitado o no concedido' : 'No compatible';
      if (usage.quota && usage.quota < usage.used) cacheState = 'Almacenamiento limitado';
      updatedAt = lastServiceWorkerUpdate();
    } catch (error) { status = errorText(error, 'No se pudo consultar el almacenamiento local.'); }
    ready = true;
    render();
  }

  async function download(id: string) {
    const item = await getAttachment(id);
    if (!item) throw new Error('El archivo ya no está guardado en este dispositivo.');
    const url = URL.createObjectURL(item.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.name;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  element.addEventListener('change', event => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-vault-action]');
    if (!input?.files?.length) return;
    const file = input.files[0]!;
    const action = input.dataset.vaultAction;
    input.disabled = true;
    status = '';
    void (async () => {
      try {
        if (action === 'upload') {
          await storeAttachment(file, 'document');
          status = 'Archivo guardado solo en este dispositivo.';
        } else if (action === 'import-vault') {
          const result = await importVaultBackup(file);
          privateCard = await getPrivateCard();
          status = `Copia privada importada: ${result.imported} archivo(s) nuevo(s), ${result.skipped} duplicado(s) omitido(s)${result.renamed ? ` y ${result.renamed} con ID reasignado por conflicto` : ''}.${result.privateCardImported ? ' Se restauraron los datos privados.' : result.privateCardImported === false ? ' Se conservaron los datos privados locales.' : ''}`;
        }
      } catch (error) { status = errorText(error, 'No se pudo guardar el archivo.'); }
      finally { input.value = ''; input.disabled = false; }
      await refresh();
    })();
  });

  element.addEventListener('submit', event => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>('[data-private-card]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    const value: PrivateCard = {
      insurer: String(data.get('insurer') ?? '').trim(),
      assistancePhone: String(data.get('assistancePhone') ?? '').trim(),
      policyReference: String(data.get('policyReference') ?? '').trim(),
      emergencyContact: String(data.get('emergencyContact') ?? '').trim(),
      note: String(data.get('note') ?? '').trim(),
    };
    void savePrivateCard(value).then(() => {
      privateCard = value;
      status = 'Datos privados guardados en este dispositivo.';
      render();
    }).catch(error => {
      status = errorText(error, 'No se pudieron guardar los datos privados.');
      render();
    });
  });

  element.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-vault-action]');
    if (!button) return;
    const action = button.dataset.vaultAction;
    const id = button.dataset.id ?? '';
    status = '';
    void (async () => {
      try {
        if (action === 'refresh') await refresh();
        else if (action === 'prepare') {
          busy = true; render();
          const result = await prepareOfflineCache();
          status = result.complete ? `Viaje preparado: ${result.cached} recursos comprobados en la caché.` : `Preparación incompleta. Faltan ${result.missing} recursos; conecta a internet y vuelve a intentarlo.`;
          busy = false;
          await refresh();
        } else if (action === 'persist') {
          const result = await navigator.storage?.persist();
          status = result ? 'El navegador concedió almacenamiento persistente.' : 'El navegador no concedió almacenamiento persistente. Conserva copias en otro lugar.';
          await refresh();
        } else if (action === 'delete') {
          const linked = app.getState().notes.some(note => note.photoId === id) || app.getState().expenses.some(expense => expense.receiptId === id);
          if (linked) { status = 'Primero desvincula este archivo del recuerdo o gasto.'; render(); return; }
          if (confirm('¿Eliminar este archivo de este dispositivo?')) { await removeAttachment(id); status = 'Archivo eliminado.'; await refresh(); }
        } else if (action === 'open') await download(id);
        else if (action === 'export-vault') {
          const backup = await exportVaultBackup();
          const url = URL.createObjectURL(backup);
          const link = document.createElement('a');
          link.href = url; link.download = 'asia-trip-boveda-privada.json'; link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
          try { localStorage.setItem(backupKey, new Date().toISOString()); backupAt = localStorage.getItem(backupKey); } catch { /* Backup can still be saved when storage is disabled. */ }
          status = 'Copia privada descargada. Guárdala fuera de carpetas públicas.';
          render();
        }
      } catch (error) { busy = false; status = errorText(error, 'No se pudo completar la operación.'); render(); }
    })();
  });

  window.addEventListener('online', () => { status = 'Conexión disponible.'; render(); });
  window.addEventListener('offline', () => { status = 'Sin conexión. El contenido precargado sigue disponible.'; render(); });
  window.addEventListener('asia-trip-sw-update', () => { status = 'Hay una actualización lista. Elige «Actualizar ahora» para instalarla.'; render(); });
  window.addEventListener('asia-trip-sw-updated', () => { updatedAt = lastServiceWorkerUpdate(); void refresh(); });
  render();
  void refresh();
}
