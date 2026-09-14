
/* GARAGEY GOOGLE DRIVE - MÓDULO AISLADO v5.1.1
   Correcciones:
   - La sesión autorizada se recuerda en localStorage y se intenta renovar
     silenciosamente al abrir la aplicación, evitando pedir conexión cada vez.
   - Al actualizar el backup existente NO se envía 'parents', porque Drive no
     permite modificar ese campo directamente en una actualización.
   - Si el token caduca, se intenta renovarlo y repetir una vez la operación.
   - La sincronización automática de 5 s nunca sustituye el guardado local. */
(function() {
  const CLIENT_ID = '806286137329-crrn5nf8dfb8gbgeui3463hj81hgk441.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE_NAME = 'garagey-backup.json';
  const LOCAL_KEY = 'garagey_data';
  const CONNECTED_KEY = 'garagey_google_connected';

  let accessToken = null;
  let tokenClient = null;
  let tokenReady = null;

  const byId = id => document.getElementById(id);

  function setStatus(message) {
    const status = byId('gdriveStatus');
    if (status) status.textContent = message;
    const last = localStorage.getItem('garagey_google_last_sync');
    const lastEl = byId('gdriveLast');
    if (lastEl) lastEl.textContent = last ? 'Última copia: ' + new Date(last).toLocaleString('es-ES') : '';
  }

  function initGoogle() {
    if (!window.google || !google.accounts || !google.accounts.oauth2) return false;
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: response => {
          if (response.error) {
            accessToken = null;
            if (response.error === 'interaction_required' || response.error === 'login_required') {
              localStorage.removeItem(CONNECTED_KEY);
            }
            if (tokenReady) { const resolve = tokenReady; tokenReady = null; resolve(false); }
            setStatus('Estado: pendiente de conectar con Google');
            return;
          }
          accessToken = response.access_token;
          localStorage.setItem(CONNECTED_KEY, '1');
          setStatus('Estado: conectado a Google Drive');
          if (tokenReady) { const resolve = tokenReady; tokenReady = null; resolve(true); }
        }
      });
    }
    return true;
  }

  function requestToken(promptValue) {
    if (!initGoogle()) return Promise.resolve(false);
    return new Promise(resolve => {
      tokenReady = resolve;
      try { tokenClient.requestAccessToken({ prompt: promptValue || '' }); }
      catch (e) { tokenReady = null; resolve(false); }
    });
  }

  window.garageyGoogleConnect = async function() {
    if (!initGoogle()) {
      setStatus('Cargando servicio de Google…');
      setTimeout(window.garageyGoogleConnect, 700);
      return;
    }
    setStatus('Conectando con Google…');
    const ok = await requestToken(localStorage.getItem(CONNECTED_KEY) === '1' ? '' : 'consent');
    if (ok) setStatus('Estado: conectado a Google Drive');
  };

  async function ensureToken(interactive) {
    if (accessToken) return true;
    const remembered = localStorage.getItem(CONNECTED_KEY) === '1';
    const ok = await requestToken(remembered ? '' : (interactive ? 'consent' : ''));
    return !!ok;
  }

  async function googleRequest(url, options = {}, retry = true) {
    if (!accessToken) throw new Error('Primero debes conectar tu cuenta de Google.');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', 'Bearer ' + accessToken);
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && retry) {
      accessToken = null;
      const ok = await requestToken('');
      if (ok) return googleRequest(url, options, false);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error('Google Drive respondió ' + response.status + (text ? ': ' + text : ''));
    }
    return response;
  }

  async function findBackup() {
    const query = encodeURIComponent("name='" + FILE_NAME + "' and trashed=false");
    const response = await googleRequest(
      'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=' + query + '&fields=files(id,name,modifiedTime)'
    );
    const json = await response.json();
    return (json.files && json.files.length) ? json.files[0] : null;
  }

  function buildMultipartBody(metadata, backup) {
    const boundary = 'garagey_' + Date.now();
    const body = [
      '--' + boundary,
      'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata),
      '--' + boundary,
      'Content-Type: application/json', '', JSON.stringify(backup),
      '--' + boundary + '--', ''
    ].join('\r\n');
    return { boundary, body };
  }

  window.garageyGoogleBackup = async function(silent) {
    if (!accessToken) {
      const ok = await ensureToken(!silent);
      if (!ok) {
        setStatus(silent ? 'Estado: cambios guardados localmente · Google no conectado' : 'Estado: sin conectar');
        if (!silent) alert('Conecta tu cuenta de Google para guardar la copia.');
        return false;
      }
    }

    try {
      setStatus('Guardando copia en Google Drive…');
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) throw new Error('No se encontraron datos locales de Garagey.');
      const backup = { version: 1, app: 'Garagey', updatedAt: new Date().toISOString(), data: JSON.parse(raw) };
      const existing = await findBackup();

      /* IMPORTANTE: parents SOLO se envía al crear el archivo.
         Drive devuelve 403 si se intenta escribir parents en PATCH. */
      const metadata = existing
        ? { name: FILE_NAME, mimeType: 'application/json' }
        : { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };

      const multipart = buildMultipartBody(metadata, backup);
      const url = existing
        ? 'https://www.googleapis.com/upload/drive/v3/files/' + existing.id + '?uploadType=multipart'
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

      await googleRequest(url, {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + multipart.boundary },
        body: multipart.body
      });

      localStorage.setItem('garagey_google_last_sync', new Date().toISOString());
      setStatus(silent ? 'Estado: ✓ sincronizado automáticamente' : 'Estado: copia guardada correctamente');
      if (!silent) alert('Copia guardada correctamente en Google Drive.');
      return true;
    } catch (error) {
      console.error('Garagey backup error:', error);
      setStatus('Error al guardar la copia');
      if (!silent) alert('No se pudo guardar la copia: ' + error.message);
      return false;
    }
  };

  window.garageyGoogleRestore = async function() {
    if (!accessToken) {
      const ok = await ensureToken(true);
      if (!ok) { alert('No se pudo conectar con Google.'); return; }
    }
    if (!confirm('¿Restaurar la copia desde Google Drive? Los datos actuales del móvil serán sustituidos.')) return;
    try {
      setStatus('Buscando copia en Google Drive…');
      const file = await findBackup();
      if (!file) throw new Error('No existe ninguna copia de Garagey en Google Drive.');
      const response = await googleRequest('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media');
      const backup = await response.json();
      const imported = backup.data || backup;
      if (!imported || !Array.isArray(imported.vehicles)) throw new Error('La copia no tiene un formato válido.');
      localStorage.setItem(LOCAL_KEY, JSON.stringify(imported));
      localStorage.setItem('garagey_google_last_sync', new Date().toISOString());
      setStatus('Estado: copia restaurada correctamente');
      alert('Copia restaurada correctamente. Garagey se recargará ahora.');
      location.reload();
    } catch (error) {
      console.error('Garagey restore error:', error);
      setStatus('Error al restaurar la copia');
      alert('No se pudo restaurar la copia: ' + error.message);
    }
  };

  window.addEventListener('load', () => {
    setTimeout(async () => {
      if (!initGoogle()) { setStatus('Estado: cargando Google…'); return; }
      const remembered = localStorage.getItem(CONNECTED_KEY) === '1';
      if (remembered) {
        setStatus('Reconectando con Google…');
        const ok = await requestToken('');
        if (ok) {
          setStatus('Estado: conectado a Google Drive');
          /* Si había cambios hechos mientras la app estaba cerrada, una copia
             automática se hará solo cuando se produzca un nuevo cambio. */
        } else {
          setStatus('Estado: sin conexión automática · pulsa Conectar Google');
        }
      } else {
        setStatus('Estado: sin conectar');
      }
    }, 900);
  });
})();
