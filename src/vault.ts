export type AttachmentPurpose = 'document' | 'photo' | 'receipt';

export type VaultAttachmentMeta = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  purpose: AttachmentPurpose;
};

export type VaultAttachment = VaultAttachmentMeta & { blob: Blob };
type StoredAttachment = VaultAttachmentMeta & { bytes: ArrayBuffer };
export type PrivateCard = { insurer: string; assistancePhone: string; policyReference: string; emergencyContact: string; note: string };
export type VaultImportResult = { imported: number; skipped: number; renamed: number; privateCardImported: boolean | null };

const DB_VERSION = 3;
const STORE = 'attachments';
const META_STORE = 'attachment-metadata';
const PRIVATE_STORE = 'private-data';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_BACKUP_BYTES = 145 * 1024 * 1024;
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const basePath = new URL(import.meta.env.BASE_URL, globalThis.location?.href ?? 'https://localhost/').pathname;
const dbName = `asia-trip-vault:${encodeURIComponent(basePath)}`;

function openVault(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('Este navegador no permite guardar archivos localmente.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = event => {
      const db = request.result;
      if (event.oldVersion < 1) db.createObjectStore(STORE, { keyPath: 'id' });
      if (event.oldVersion < 2) {
        const metadata = db.createObjectStore(META_STORE, { keyPath: 'id' });
        if (event.oldVersion > 0) {
          const cursor = request.transaction!.objectStore(STORE).openCursor();
          cursor.onsuccess = () => {
            const item = cursor.result;
            if (!item) return;
            const { id, name, type, size, createdAt, purpose } = item.value as VaultAttachment;
            metadata.put({ id, name, type, size, createdAt, purpose } satisfies VaultAttachmentMeta);
            item.continue();
          };
        }
      }
      if (event.oldVersion < 3) db.createObjectStore(PRIVATE_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la bóveda local.'));
    request.onblocked = () => reject(new Error('Cierra otras pestañas de Asia Trip y vuelve a intentarlo.'));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo acceder al archivo local.'));
  });
}

function readAttachment(record: StoredAttachment | VaultAttachment): VaultAttachment {
  if ('blob' in record) return record;
  const { bytes, ...meta } = record;
  return { ...meta, blob: new Blob([bytes], { type: meta.type }) };
}

function signatureType(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

async function safeFile(file: File, compressImage = true): Promise<{ blob: Blob; type: string }> {
  const max = file.type.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (file.size <= 0 || file.size > max) throw new Error(`El archivo supera el límite de ${Math.round(max / 1024 / 1024)} MB o está vacío.`);
  const bytes = await file.arrayBuffer();
  const detected = signatureType(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 16)));
  if (!detected || !allowedTypes.has(detected) || (file.type && file.type !== detected && !(file.type === 'application/octet-stream'))) {
    throw new Error('Formato no admitido o contenido que no coincide con el tipo del archivo. Usa PDF, JPEG, PNG o WebP.');
  }
  const source = new Blob([bytes], { type: detected });
  if (detected === 'application/pdf') return { blob: source, type: detected };
  if (source.size > MAX_IMAGE_BYTES) throw new Error('La imagen supera el límite de 15 MB.');
  if (!compressImage) return { blob: source, type: detected };
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return { blob: source, type: detected };
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(source); }
  catch { throw new Error('No se pudo leer la imagen. Guarda una copia como JPEG, PNG o WebP y vuelve a intentarlo.'); }
  try {
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return { blob: source, type: detected };
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob ? { blob, type: 'image/jpeg' } : { blob: source, type: detected };
  } finally { bitmap.close(); }
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo guardar el archivo.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('No se pudo guardar el archivo.'));
  });
}

export async function storeAttachment(file: File, purpose: AttachmentPurpose = 'document'): Promise<VaultAttachmentMeta> {
  const safe = await safeFile(file);
  const meta: VaultAttachmentMeta = {
    id: crypto.randomUUID(),
    name: file.name.slice(0, 240) || 'archivo',
    type: safe.type,
    size: safe.blob.size,
    createdAt: new Date().toISOString(),
    purpose,
  };
  // Use an ArrayBuffer so the database does not keep a reference to the file picker's temporary Blob on WebKit.
  const bytes = await safe.blob.arrayBuffer();
  const db = await openVault();
  try {
    const transaction = db.transaction([STORE, META_STORE], 'readwrite');
    let tooLarge = false;
    const done = transactionDone(transaction);
    const request = transaction.objectStore(META_STORE).getAll();
    request.onsuccess = () => {
      const total = (request.result as VaultAttachmentMeta[]).reduce((sum, item) => sum + item.size, 0);
      if (total + safe.blob.size > MAX_TOTAL_BYTES) { tooLarge = true; transaction.abort(); return; }
      transaction.objectStore(STORE).add({ ...meta, bytes } satisfies StoredAttachment);
      transaction.objectStore(META_STORE).add(meta);
    };
    try { await done; }
    catch (error) {
      if (tooLarge) throw new Error('La bóveda alcanzó su límite local de 100 MB. Exporta una copia y elimina archivos que ya no necesites.', { cause: error });
      throw error;
    }
    return meta;
  } finally { db.close(); }
}

export async function getAttachment(id: string): Promise<VaultAttachment | null> {
  const db = await openVault();
  try {
    const result = await requestValue<StoredAttachment | VaultAttachment | undefined>(db.transaction(STORE, 'readonly').objectStore(STORE).get(id));
    return result ? readAttachment(result) : null;
  } finally { db.close(); }
}

export async function listAttachments(): Promise<VaultAttachmentMeta[]> {
  const db = await openVault();
  try {
    const rows = await requestValue<VaultAttachmentMeta[]>(db.transaction(META_STORE, 'readonly').objectStore(META_STORE).getAll());
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally { db.close(); }
}

export async function removeAttachment(id: string): Promise<void> {
  const db = await openVault();
  try {
    const transaction = db.transaction([STORE, META_STORE], 'readwrite');
    transaction.objectStore(STORE).delete(id);
    transaction.objectStore(META_STORE).delete(id);
    await transactionDone(transaction);
  } finally { db.close(); }
}

export async function vaultUsage(): Promise<{ used: number; quota: number | null; files: number }> {
  const files = await listAttachments();
  let quota: number | null = null;
  try { quota = (await navigator.storage?.estimate())?.quota ?? null; } catch { /* Optional browser diagnostic. */ }
  return { used: files.reduce((sum, file) => sum + file.size, 0), quota, files: files.length };
}

const emptyPrivateCard: PrivateCard = { insurer: '', assistancePhone: '', policyReference: '', emergencyContact: '', note: '' };
function validPrivateCard(value: unknown): value is PrivateCard {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return ['insurer', 'assistancePhone', 'policyReference', 'emergencyContact', 'note'].every(key => typeof row[key] === 'string' && (row[key] as string).length <= 1000);
}

export async function getPrivateCard(): Promise<PrivateCard> {
  const db = await openVault();
  try {
    const saved = await requestValue<{ key: string; value: PrivateCard } | undefined>(db.transaction(PRIVATE_STORE, 'readonly').objectStore(PRIVATE_STORE).get('insurance'));
    return saved && validPrivateCard(saved.value) ? saved.value : { ...emptyPrivateCard };
  } finally { db.close(); }
}

export async function savePrivateCard(value: PrivateCard): Promise<void> {
  if (!validPrivateCard(value)) throw new Error('Los datos privados superan el límite permitido.');
  const db = await openVault();
  try {
    const transaction = db.transaction(PRIVATE_STORE, 'readwrite');
    transaction.objectStore(PRIVATE_STORE).put({ key: 'insurance', value });
    await transactionDone(transaction);
  } finally { db.close(); }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

async function equalBlobs(first: Blob, second: Blob): Promise<boolean> {
  if (first.size !== second.size) return false;
  const [a, b] = await Promise.all([first.arrayBuffer(), second.arrayBuffer()]);
  const [hashA, hashB] = await Promise.all([crypto.subtle.digest('SHA-256', a), crypto.subtle.digest('SHA-256', b)]);
  const bytesA = new Uint8Array(hashA), bytesB = new Uint8Array(hashB);
  return bytesA.every((byte, index) => byte === bytesB[index]);
}

export async function exportVaultBackup(): Promise<Blob> {
  const db = await openVault();
  try {
    const transaction = db.transaction([STORE, PRIVATE_STORE], 'readonly');
    const [rows, savedCard] = await Promise.all([
      requestValue<Array<StoredAttachment | VaultAttachment>>(transaction.objectStore(STORE).getAll()),
      requestValue<{ key: string; value: PrivateCard } | undefined>(transaction.objectStore(PRIVATE_STORE).get('insurance')),
    ]);
    const files = await Promise.all(rows.map(async row => {
      const { blob, ...meta } = readAttachment(row);
      return { ...meta, data: toBase64(new Uint8Array(await blob.arrayBuffer())) };
    }));
    const privateCard = savedCard && validPrivateCard(savedCard.value) ? savedCard.value : null;
    const backup = new Blob([JSON.stringify({ format: 'asia-trip-vault', version: 2, exportedAt: new Date().toISOString(), files, privateCard })], { type: 'application/json' });
    if (backup.size > MAX_BACKUP_BYTES) throw new Error('La copia privada supera el tamaño máximo admitido. Exporta o elimina algunos archivos y vuelve a intentarlo.');
    return backup;
  } finally { db.close(); }
}

export async function importVaultBackup(file: File): Promise<VaultImportResult> {
  if (file.size <= 0 || file.size > MAX_BACKUP_BYTES) throw new Error('La copia privada está vacía o supera el límite de 145 MB.');
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('La copia privada no contiene JSON válido.'); }
  if (!parsed || typeof parsed !== 'object' || !('format' in parsed) || parsed.format !== 'asia-trip-vault' || !('version' in parsed) || ![1, 2].includes(Number(parsed.version)) || !('files' in parsed) || !Array.isArray(parsed.files) || parsed.files.length > 500) {
    throw new Error('La estructura de la copia privada no es compatible.');
  }
  const items: VaultAttachment[] = [];
  const importedIds = new Set<string>();
  let total = 0;
  for (const item of parsed.files) {
    if (!item || typeof item !== 'object') throw new Error('La copia contiene un archivo inválido.');
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !/^[\w.:@-]{1,100}$/.test(row.id) || importedIds.has(row.id) || typeof row.name !== 'string' || row.name.length > 240 || typeof row.type !== 'string' || typeof row.purpose !== 'string' || !['document', 'photo', 'receipt'].includes(row.purpose) || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) || typeof row.data !== 'string' || row.data.length > 35_000_000) {
      throw new Error('La copia contiene metadatos de archivo inválidos.');
    }
    importedIds.add(row.id);
    const decoded = Uint8Array.from(atob(row.data), character => character.charCodeAt(0));
    const file = new File([decoded], row.name, { type: row.type });
    const safe = await safeFile(file, false);
    total += safe.blob.size;
    if (total > MAX_TOTAL_BYTES) throw new Error('Los archivos de la copia superan el límite local de 100 MB.');
    items.push({ id: row.id, name: row.name, type: safe.type, size: safe.blob.size, createdAt: row.createdAt, purpose: row.purpose as AttachmentPurpose, blob: safe.blob });
  }
  const incomingCard = 'privateCard' in parsed && parsed.privateCard !== null ? parsed.privateCard : null;
  if (incomingCard !== null && !validPrivateCard(incomingCard)) throw new Error('La copia contiene datos privados inválidos.');
  let skipped = 0, renamed = 0;
  const existingRows = await listAttachments();
  for (const item of items) {
    const existingMeta = existingRows.find(existing => existing.id === item.id);
    if (!existingMeta) continue;
    const existing = await getAttachment(item.id);
    const same = existing && existing.name === item.name && existing.type === item.type && await equalBlobs(existing.blob, item.blob);
    if (same) { item.id = ''; skipped++; }
    else { item.id = crypto.randomUUID(); renamed++; }
  }
  const pending = await Promise.all(items.filter(item => item.id !== '').map(async ({ blob, ...meta }) =>
    ({ ...meta, bytes: await blob.arrayBuffer() } satisfies StoredAttachment)));
  const pendingBytes = pending.reduce((sum, item) => sum + item.size, 0);
  const db = await openVault();
  try {
    const transaction = db.transaction([STORE, META_STORE, PRIVATE_STORE], 'readwrite');
    let tooLarge = false;
    const done = transactionDone(transaction);
    const request = transaction.objectStore(META_STORE).getAll();
    let privateCardImported: boolean | null = incomingCard === null ? null : false;
    request.onsuccess = () => {
      const used = (request.result as VaultAttachmentMeta[]).reduce((sum, item) => sum + item.size, 0);
      if (used + pendingBytes > MAX_TOTAL_BYTES) { tooLarge = true; transaction.abort(); return; }
      const store = transaction.objectStore(STORE);
      const metadata = transaction.objectStore(META_STORE);
      for (const item of pending) {
        store.add(item);
        const { id, name, type, size, createdAt, purpose } = item;
        metadata.add({ id, name, type, size, createdAt, purpose } satisfies VaultAttachmentMeta);
      }
      if (incomingCard !== null) {
        const cardStore = transaction.objectStore(PRIVATE_STORE);
        const cardRequest = cardStore.get('insurance');
        cardRequest.onsuccess = () => {
          if (!cardRequest.result) { cardStore.put({ key: 'insurance', value: incomingCard }); privateCardImported = true; }
        };
      }
    };
    try { await done; }
    catch (error) {
      if (tooLarge) throw new Error('No hay espacio suficiente en la bóveda local. Exporta una copia y elimina archivos antes de importar.', { cause: error });
      throw error;
    }
    return { imported: pending.length, skipped, renamed, privateCardImported };
  } finally { db.close(); }
}
