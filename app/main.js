// Cartelera de Cine – Vue 3 + Vue Router
// Carlos Eduardo Hernández Lecointe – 1890-18-17646

const { createApp, ref, computed, watch, onMounted } = Vue;
const { createRouter, createWebHashHistory, useRoute, useRouter, RouterLink, RouterView } = VueRouter;

const API = 'https://movie.azurewebsites.net/api/cartelera';

// ===== Helpers de API (POST / PUT / DELETE / GET by id) =====
async function apiCreate(movie) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(movie)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(sin cuerpo)');
    throw new Error(`POST ${res.status} ${body}`);
  }
  return tryJson(res);
}
async function apiUpdate(imdbID, movie) {
  const url = `${API}?${new URLSearchParams({ imdbID })}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(movie)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(sin cuerpo)');
    throw new Error(`PUT ${res.status} ${body}`);
  }
  return tryJson(res);
}
async function apiDelete(imdbID) {
  const url = `${API}?${new URLSearchParams({ imdbID })}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.text().catch(() => '(sin cuerpo)');
    throw new Error(`DELETE ${res.status} ${body}`);
  }
  return true;
}

async function apiGetById(imdbID) {
  const url = `${API}?${new URLSearchParams({ imdbID })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET-id ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? (data[0] || null) : data;
}
async function tryJson(res) {
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? await res.json() : true;
}
// Detecta errores típicos de CORS o bloqueo de red
// ===== Helpers seguros con fallback local =====
function isLikelyCorsOrBlocked(errMsg) {
  return /Failed to fetch|CORS|NetworkError|TypeError/i.test(String(errMsg));
}

async function safeCreate(movie) {
  try {
    await apiCreate(movie);
    return { ok: true, msg: `Película creada en la API: ${movie.imdbID}` };
  } catch (e) {
    if (isLikelyCorsOrBlocked(e.message) || /POST\s(403|405)/.test(e.message)) {
      store.addMovie(movie);
      return { ok: false, msg: `La API bloqueó el POST (CORS/405). Guardado local para demo: ${movie.imdbID}` };
    }
    throw e;
  }
}

async function safeUpdate(id, movie) {
  try {
    await apiUpdate(id, movie);
    return { ok: true, msg: `Cambios guardados en la API para ${id}` };
  } catch (e) {
    // si es 4xx/5xx o error de red, guardamos override local
    if (isLikelyCorsOrBlocked(e.message) || /PUT\s(4\d\d|5\d\d)/.test(e.message)) {
      store.setOverride(id, movie);
      return { ok: false, msg: `La API no permitió el PUT (${e.message}). Cambios guardados localmente (override) para demo: ${id}` };
    }
    throw e;
  }
}

async function safeDelete(id) {
  try {
    await apiDelete(id);
    return { ok: true, msg: `Eliminado en la API: ${id}` };
  } catch (e) {
    if (isLikelyCorsOrBlocked(e.message) || /DELETE\s(403|405)/.test(e.message)) {
      store.delete(id);
      return { ok: false, msg: `La API bloqueó el DELETE. Marcado como eliminado localmente (demo): ${id}` };
    }
    throw e;
  }
}

// ===== Utilidades =====
const truncate = (txt, n = 100) => typeof txt === 'string' && txt.length > n ? txt.slice(0, n - 1).trimEnd() + '…' : txt;
const asText = v => v == null ? '' : Array.isArray(v) ? v.join(', ') : (typeof v === 'object' ? JSON.stringify(v) : String(v));
const getPosterUrl = o => {
  const p = o?.Poster ?? o?.poster ?? o?.image ?? o?.posterUrl ?? o?.img;
  return (typeof p === 'string' && /^https?:\/\//.test(p)) ? p : null;
};
const buildListURL = (title, ubication) => `${API}?${new URLSearchParams({ title: (title || '').trim(), ubication: (ubication || '').trim() })}`;
const buildDetailURL = imdbID => `${API}?${new URLSearchParams({ imdbID })}`;

// ===== Componentes =====
const MovieCard = {
  name: 'MovieCard',
  props: { item: { type: Object, required: true } },
  emits: ['edit', 'delete'], // ← para tipar los eventos
  setup(props) {
    const title = computed(() => props.item.Title || props.item.title || props.item.Nombre || 'Película');
    const imdbID = computed(() => props.item.imdbID ?? props.item.imdbId ?? props.item.id ?? '');
    const poster = computed(() => getPosterUrl(props.item));
    const fields = computed(() => props.item);
    return { title, imdbID, poster, fields, truncate, asText };
  },
  template: `
    <article class="card h-100 shadow-sm">
      <img v-if="poster" :src="poster" :alt="'Poster de ' + title"
           class="card-img-top" @error="$event.target.style.display='none'">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong class="h6 mb-0">{{ title }}</strong>
          <div class="btn-group">
            <RouterLink v-if="imdbID"
                        :to="{ name:'detail', params:{ imdbID } }"
                        class="btn btn-sm btn-outline-info">Detalle</RouterLink>
            <button v-if="imdbID"
                    class="btn btn-sm btn-outline-warning"
                    @click="$emit('edit', imdbID)">Editar</button>
            <button v-if="imdbID"
                    class="btn btn-sm btn-outline-danger"
                    @click="$emit('delete', imdbID)">
              Eliminar
            </button>
          </div>
        </div>

        <dl class="row mb-0">
          <template v-for="(v,k) in fields" :key="k">
            <dt class="col-sm-4 text-secondary">{{ k }}</dt>
            <dd class="col-sm-8">{{ k.toLowerCase().includes('desc') ? truncate(asText(v),100) : asText(v) }}</dd>
          </template>
        </dl>
      </div>
    </article>
  `
};

const ListView = {
  name: 'ListView',
  components: { MovieCard, RouterLink },
  setup() {
    const route = useRoute();
    const router = useRouter();

    const title = ref(route.query.title || '');
    const ubication = ref(route.query.ubication || '');
    const genre = ref(route.query.genre || '');
    const loading = ref(false);
    const error = ref('');
    const items = ref([]);

    const fetchList = async () => {
      loading.value = true; error.value = ''; items.value = [];
      try {
        const url = buildListURL(title.value, ubication.value);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // 👇 aplica soft-CRUD local antes de filtrar por género
        items.value = composeListWithLocal(data, {
          title: title.value,
          ubication: ubication.value
        });
      } catch (e) {
        error.value = e.message;
      } finally {
        loading.value = false;
      }
    };

    const onSubmit = () => {
      router.replace({
        name: 'home',
        query: {
          title: title.value.trim(),
          ubication: ubication.value.trim(),
          genre: genre.value.trim()
        }
      });
    };

    const clearFilters = () => {
      title.value = ''; ubication.value = ''; genre.value = '';
      router.replace({ name: 'home', query: { title: '', ubication: '', genre: '' } });
    };

    const filtered = computed(() => {
      return items.value.filter(m => {
        const t = (title.value || '').toLowerCase();
        const u = (ubication.value || '').toLowerCase();
        const g = (genre.value || '').toLowerCase();
        const mt = (m.Title ?? m.title ?? '').toLowerCase().includes(t);
        const mu = (m.Ubication ?? m.ubication ?? m.ubicacion ?? '').toLowerCase().includes(u);
        const mg = (m.Type ?? m.type ?? '').toLowerCase().includes(g);
        return mt && mu && (g ? mg : true);
      });
    });

    // Acciones por tarjeta
    const deleteById = async (id) => {
      if (!confirm('¿Eliminar esta película?')) return;
      try {
        const { ok, msg } = await safeDelete(String(id));
        await fetchList();          // refresca listado
        alert(msg);
      } catch (e) {
        alert(`Error eliminando: ${e.message}`);
      }
    };

    const goEdit = (id) => {
      router.push({ name: 'admin', query: { edit: String(id) } });
    };

    watch(() => route.query, fetchList, { immediate: true });

    return {
      title, ubication, genre,
      loading, error, items, filtered,
      onSubmit, clearFilters,
      deleteById, goEdit              // exponer las acciones
    };
  },
  template: `
<section class="container container-narrow py-3">
  <form class="row g-3 align-items-end" @submit.prevent="onSubmit">
    <div class="col-12 col-md-4">
      <label for="title" class="form-label mb-1">Título</label>
      <input id="title" v-model="title" type="text" class="form-control" placeholder="Ej: Batman" />
    </div>

    <div class="col-12 col-md-4">
      <label for="ubication" class="form-label mb-1">Ubicación</label>
      <input id="ubication" v-model="ubication" type="text" class="form-control" placeholder="Ej: OKLAN" />
    </div>

    <div class="col-12 col-md-3">
      <label for="genre" class="form-label mb-1">Género</label>
      <select id="genre" v-model="genre" class="form-select">
        <option value="">Todos</option>
        <option value="Acción">Acción</option>
        <option value="Aventura">Aventura</option>
        <option value="Comedia">Comedia</option>
        <option value="Drama">Drama</option>
        <option value="Ciencia Ficcion">Ciencia Ficción</option>
        <option value="Terror">Terror</option>
        <option value="Infantil">Infantil</option>
        <option value="Romance">Romance</option>
        <option value="Trivia">Trivia</option>
      </select>
    </div>

    <div class="col-12 col-md-1 d-flex gap-2">
      <button class="btn btn-primary w-100" type="submit">Buscar</button>
    </div>

    <div class="col-12 d-flex gap-2">
      <button class="btn btn-outline-secondary ms-auto" type="button" @click="clearFilters">Limpiar</button>
    </div>
  </form>

  <div v-if="loading" class="alert state mt-3">
    <span class="text-secondary">Cargando cartelera…</span>
  </div>
  <div v-else-if="error" class="alert state error mt-3">Error al cargar: {{ error }}</div>
  <div v-else-if="filtered.length===0" class="alert state ok mt-3">
    No hay resultados para los criterios ingresados.
  </div>

<section class="row g-3 mt-2">
  <div class="col-12 col-sm-6 col-md-4"
       v-for="it in filtered"
       :key="it.imdbID || it.imdbId || it.id">
    <MovieCard :item="it" @edit="goEdit" @delete="deleteById" />
  </div>
</section>
  `
};

const DetailView = {
  name: 'DetailView',
  components: { RouterLink },
  setup() {
    const route = useRoute();
    const imdbID = computed(() => route.params.imdbID);
    const loading = ref(false);
    const error = ref('');
    const movie = ref(null);

    const fetchDetail = async () => {
      loading.value = true; error.value = ''; movie.value = null;
      try {
        const fromApi = await apiGetById(imdbID.value);
        movie.value = composeDetailWithLocal(fromApi, imdbID.value);
      } catch (e) {
        movie.value = composeDetailWithLocal(null, imdbID.value); // último recurso: solo local
        error.value = e.message;
      } finally { loading.value = false; }
    };

    // Derivados para pintar limpio
    const posterUrl = computed(() => movie.value ? getPosterUrl(movie.value) : null);
    const titleTxt = computed(() => movie.value?.Title || movie.value?.title || movie.value?.Nombre || `Película ${imdbID.value}`);

    // Campos a mostrar (ocultamos Poster bruto para no romper diseño)
    const fields = computed(() => {
      if (!movie.value) return [];
      const src = movie.value;
      return [
        { k: 'imdbID', v: src.imdbID ?? src.imdbId ?? src.id ?? '' },
        { k: 'Title', v: src.Title ?? src.title ?? '' },
        { k: 'Year', v: src.Year ?? src.year ?? '' },
        { k: 'Type', v: src.Type ?? src.type ?? '' },
        { k: 'description', v: src.description ?? src.Descripcion ?? src.Descripción ?? src.sinopsis ?? '' },
        { k: 'Ubication', v: src.Ubication ?? src.ubication ?? src.ubicacion ?? '' },
      ];
    });

    watch(imdbID, fetchDetail, { immediate: true });
    return { imdbID, loading, error, movie, posterUrl, titleTxt, fields, asText };
  },
  template: `
    <section class="container container-narrow py-3">
      <RouterLink :to="{name:'home'}" class="link-accent d-inline-block mb-3">← Volver</RouterLink>

      <div v-if="loading" class="alert state">Cargando detalle…</div>
      <div v-else-if="error" class="alert state error">Error al cargar: {{ error }}</div>
      <div v-else-if="!movie" class="alert state ok">No se encontró la película.</div>

      <article v-else class="card shadow-sm p-3">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-md-5">
            <img v-if="posterUrl" :src="posterUrl" :alt="'Poster de ' + titleTxt"
                 class="card-img-top mb-2" @error="$event.target.style.display='none'">
            <a v-if="posterUrl" :href="posterUrl" target="_blank" rel="noopener" class="small link-accent">Abrir póster en pestaña nueva</a>
          </div>
          <div class="col-12 col-md-7">
            <h2 class="h4 mb-1">{{ titleTxt }}</h2>
            <div class="text-secondary mb-3">Detalle completo (<code>imdbID={{ imdbID }}</code>)</div>

            <dl class="row mb-0">
              <template v-for="f in fields" :key="f.k">
                <dt class="col-sm-4 text-secondary">{{ f.k }}</dt>
                <dd class="col-sm-8" :class="{'desc': f.k.toLowerCase().includes('desc'), 'break-anywhere': true}">
                  {{ asText(f.v) }}
                </dd>
              </template>
            </dl>
          </div>
        </div>
      </article>
    </section>
  `
};

const AppShell = {
  components: { RouterLink, RouterView },
  template: `
    <div>
      <nav class="navbar navbar-expand-lg navbar-dark sticky-top">
        <div class="container container-narrow py-1">
          <RouterLink class="navbar-brand" :to="{name:'home'}">Cartelera de Cine</RouterLink>
          <div class="ms-auto d-flex align-items-center gap-3">
            <RouterLink class="link-accent small" :to="{name:'admin'}">Admin</RouterLink>
            <div class="text-secondary small">
              Carlos Eduardo Hernández Lecointe · <strong>1890-18-17646</strong>
            </div>
          </div>
        </div>
      </nav>
      <RouterView />
      <footer class="py-4 mt-4 text-center text-secondary">
        <small>&copy; 2025 Cartelera de Cine · Desarrollado por Carlos Eduardo Hernández Lecointe <code>1890-18-17646</code> · Todos los derechos reservados</small>
      </footer>
    </div>
  `
};

// ===== Almacenamiento local (persistencia en el navegador) =====
const STORAGE_KEYS = {
  overrides: 'cartelera_overrides', // { [imdbID]: { ...camposEditados } }
  adds: 'cartelera_adds',      // { [imdbID]: { ...peliculaNueva } }
  deletes: 'cartelera_deletes'    // string[] de imdbID eliminados
};

const loadJSON = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
  catch { return fallback; }
};
const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const store = {
  getOverrides() { return loadJSON(STORAGE_KEYS.overrides, {}); },
  setOverride(id, data) {
    const cur = loadJSON(STORAGE_KEYS.overrides, {});
    cur[id] = { ...(cur[id] || {}), ...data };
    saveJSON(STORAGE_KEYS.overrides, cur);
  },
  removeOverride(id) {
    const cur = loadJSON(STORAGE_KEYS.overrides, {});
    delete cur[id];
    saveJSON(STORAGE_KEYS.overrides, cur);
  },

  getAdds() { return loadJSON(STORAGE_KEYS.adds, {}); },
  addMovie(movie) {
    const id = String(movie.imdbID ?? movie.imdbId ?? movie.id);
    if (!id) throw new Error('La película nueva debe tener imdbID');
    const cur = loadJSON(STORAGE_KEYS.adds, {});
    cur[id] = movie;
    saveJSON(STORAGE_KEYS.adds, cur);
  },
  removeAdd(id) {
    const cur = loadJSON(STORAGE_KEYS.adds, {});
    delete cur[id];
    saveJSON(STORAGE_KEYS.adds, cur);
  },

  // Nuevo helper: obtener una película agregada por ID
  getAdd(id) {
    const cur = loadJSON(STORAGE_KEYS.adds, {});
    return cur[String(id)] || null;
  },

  getDeletes() { return loadJSON(STORAGE_KEYS.deletes, []); },
  delete(id) {
    const arr = new Set(loadJSON(STORAGE_KEYS.deletes, []));
    arr.add(String(id));
    saveJSON(STORAGE_KEYS.deletes, [...arr]);
  },
  undelete(id) {
    const arr = new Set(loadJSON(STORAGE_KEYS.deletes, []));
    arr.delete(String(id));
    saveJSON(STORAGE_KEYS.deletes, [...arr]);
  },

  // Nuevo helper: saber si un id está eliminado
  isDeleted(id) {
    return loadJSON(STORAGE_KEYS.deletes, []).includes(String(id));
  },

  resetAll() {
    localStorage.removeItem(STORAGE_KEYS.overrides);
    localStorage.removeItem(STORAGE_KEYS.adds);
    localStorage.removeItem(STORAGE_KEYS.deletes);
  }
};

// Aplica overrides y deletes a una lista venida de la API, y agrega “adds”
function composeListWithLocal(data, { title = '', ubication = '' } = {}) {
  const dset = new Set(store.getDeletes());
  const ov = store.getOverrides();
  const adds = store.getAdds();

  const norm = (arr => (Array.isArray(arr) ? arr : []))
    (data)
    .filter(x => {
      const id = String(x.imdbID ?? x.imdbId ?? x.id ?? '');
      return id && !dset.has(id);
    })
    .map(x => {
      const id = String(x.imdbID ?? x.imdbId ?? x.id ?? '');
      return ov[id] ? ({ ...x, ...ov[id] }) : x;
    });

  // incluir agregadas locales que coincidan con filtros
  const matches = (m) => {
    const t = (title || '').toLowerCase();
    const u = (ubication || '').toLowerCase();
    const mt = (m.Title ?? m.title ?? '').toLowerCase().includes(t);
    const mu = (m.Ubication ?? m.ubication ?? m.ubicacion ?? '').toLowerCase().includes(u);
    return (t ? mt : true) && (u ? mu : true);
  };

  const addList = Object.values(adds)
    .filter(m => !dset.has(String(m.imdbID ?? m.imdbId ?? m.id ?? '')))
    .filter(matches);

  return [...addList, ...norm];
}

// Funde overrides / deletes en un único objeto detalle
function composeDetailWithLocal(movie, idMaybe) {
  const id = String(
    idMaybe ??
    movie?.imdbID ?? movie?.imdbId ?? movie?.id ?? ''
  );

  if (!id) return movie || null;
  if (store.isDeleted(id)) return null;

  // Si la API no lo trae, probar si es una 'add' local
  if (!movie) {
    const added = store.getAdd(id);
    if (!added) return null;
    const ov = store.getOverrides()[id];
    return ov ? { ...added, ...ov } : added;
  }

  // Si viene de API, aplicar override si existe
  const ov = store.getOverrides()[id];
  return ov ? { ...movie, ...ov } : movie;
}

// ==== Admin (CRUD real contra la API) ====
const AdminView = {
  name: 'AdminView',
  setup() {
    // formularios
    const formAdd = ref({ imdbID: '', Title: '', Year: '', Type: '', Ubication: '', description: '', Poster: '' });
    const formEditId = ref('');
    const formEdit = ref(null);
    const message = ref('');
    const error = ref('');

    // lee la query ?edit=...
    const route = useRoute();

    // --- GET por id para precargar edición ---
    const loadForEdit = async () => {
      error.value = ''; message.value = ''; formEdit.value = null;
      const id = formEditId.value.trim();
      if (!id) { error.value = 'Ingresa un imdbID para editar'; return; }
      try {
        const m = await apiGetById(id);
        if (!m) { error.value = 'No encontrado en la API.'; return; }
        formEdit.value = {
          imdbID: m.imdbID ?? m.imdbId ?? m.id ?? id,
          Title: m.Title ?? m.title ?? '',
          Year: m.Year ?? m.year ?? '',
          Type: m.Type ?? m.type ?? '',
          Ubication: m.Ubication ?? m.ubication ?? m.ubicacion ?? '',
          Poster: getPosterUrl(m) ?? '',
          description: m.description ?? m.Descripcion ?? m.Descripción ?? '',
          Estado: (typeof m.Estado === 'boolean') ? m.Estado : true
        };
      } catch (e) { error.value = e.message; }
    };

    // aquí integras tu bloque para precargar automáticamente si viene ?edit=ID
    onMounted(() => {
      const toEdit = route.query.edit ? String(route.query.edit) : '';
      if (toEdit) {
        formEditId.value = toEdit;
        loadForEdit();
      }
    });

    // --- POST (crear) ---
    const saveAdd = async () => {
      error.value = ''; message.value = '';
      try {
        const m = {
          imdbID: formAdd.value.imdbID,
          Title: formAdd.value.Title,
          Year: String(formAdd.value.Year || ''),
          Type: formAdd.value.Type,
          Poster: formAdd.value.Poster,
          Estado: true,
          description: formAdd.value.description,
          Ubication: formAdd.value.Ubication
        };
        if (!m.imdbID) throw new Error('imdbID es obligatorio');
        const { msg } = await safeCreate(m);
        message.value = msg;
        formAdd.value = { imdbID: '', Title: '', Year: '', Type: '', Ubication: '', description: '', Poster: '' };
      } catch (e) { error.value = e.message; }
    };

    const saveEdit = async () => {
      error.value = ''; message.value = '';
      try {
        if (!formEdit.value?.imdbID) throw new Error('imdbID es obligatorio');
        const id = String(formEdit.value.imdbID);
        const payload = {
          imdbID: id,
          Title: String(formEdit.value.Title || '').trim(),
          Year: String(formEdit.value.Year || '').trim(),
          Type: String(formEdit.value.Type || '').trim(),
          Poster: String(formEdit.value.Poster || '').trim(),
          Estado: (typeof formEdit.value.Estado === 'boolean') ? formEdit.value.Estado : true,
          description: String(formEdit.value.description || ''),
          Ubication: String(formEdit.value.Ubication || '').trim()
        };
        const { msg } = await safeUpdate(id, payload);
        message.value = msg;
      } catch (e) { error.value = e.message; }
    };

    // --- DELETE (eliminar) ---
    const doDelete = async () => {
      error.value = '';
      message.value = '';
      try {
        const id = (formEditId.value.trim() || formEdit.value?.imdbID || '').trim();
        if (!id) throw new Error('Indica imdbID');
        const { msg } = await safeDelete(id);   // 👈 usa el helper con fallback
        message.value = msg;
        formEdit.value = null;                  // limpia el formulario
      } catch (e) {
        error.value = e.message;
      }
    };

    return { formAdd, formEditId, formEdit, message, error, loadForEdit, saveAdd, saveEdit, doDelete };
  },
  template: `
    <section class="container container-narrow py-3">
      <RouterLink :to="{name:'home'}" class="link-accent d-inline-block mb-3">← Volver</RouterLink>
      <h2 class="h4 mb-3">Administración</h2>

      <div v-if="message" class="alert state ok my-2">{{ message }}</div>
      <div v-if="error" class="alert state error my-2">Error: {{ error }}</div>

      <div class="row g-3">
        <!-- AGREGAR -->
        <div class="col-12 col-lg-6">
          <div class="card p-3">
            <h3 class="h5">Agregar película</h3>
            <div class="row g-2">
              <div class="col-6"><label class="form-label">imdbID</label><input v-model="formAdd.imdbID" class="form-control"></div>
              <div class="col-6"><label class="form-label">Title</label><input v-model="formAdd.Title" class="form-control"></div>
              <div class="col-4"><label class="form-label">Year</label><input v-model="formAdd.Year" class="form-control"></div>
              <div class="col-8"><label class="form-label">Type</label><input v-model="formAdd.Type" class="form-control"></div>
              <div class="col-12"><label class="form-label">Ubication</label><input v-model="formAdd.Ubication" class="form-control"></div>
              <div class="col-12"><label class="form-label">Poster (URL)</label><input v-model="formAdd.Poster" class="form-control"></div>
              <div class="col-12"><label class="form-label">description</label><textarea v-model="formAdd.description" rows="4" class="form-control"></textarea></div>
            </div>
            <div class="mt-3 d-flex gap-2">
              <button class="btn btn-primary" @click="saveAdd" type="button">Agregar</button>
            </div>
          </div>
        </div>

        <!-- EDITAR / ELIMINAR -->
        <div class="col-12 col-lg-6">
          <div class="card p-3">
            <h3 class="h5">Editar / Eliminar por imdbID</h3>
            <div class="row g-2 align-items-end">
              <div class="col-8"><label class="form-label">imdbID</label><input v-model="formEditId" class="form-control" placeholder="Ej: 80001"></div>
              <div class="col-4"><button class="btn btn-primary w-100" @click="loadForEdit" type="button">Cargar</button></div>
            </div>

            <template v-if="formEdit">
              <hr />
              <div class="row g-2">
                <div class="col-6"><label class="form-label">imdbID</label><input v-model="formEdit.imdbID" class="form-control"></div>
                <div class="col-6"><label class="form-label">Title</label><input v-model="formEdit.Title" class="form-control"></div>
                <div class="col-4"><label class="form-label">Year</label><input v-model="formEdit.Year" class="form-control"></div>
                <div class="col-8"><label class="form-label">Type</label><input v-model="formEdit.Type" class="form-control"></div>
                <div class="col-12"><label class="form-label">Ubication</label><input v-model="formEdit.Ubication" class="form-control"></div>
                <div class="col-12"><label class="form-label">Poster (URL)</label><input v-model="formEdit.Poster" class="form-control"></div>
                <div class="col-12"><label class="form-label">description</label><textarea v-model="formEdit.description" rows="4" class="form-control"></textarea></div>
              </div>
              <div class="mt-3 d-flex flex-wrap gap-2">
                <button class="btn btn-primary" @click="saveEdit" type="button">Guardar cambios</button>
                <button class="btn btn-outline-danger" @click="doDelete" type="button">Eliminar</button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </section>
  `
};

// ===== Router =====
const routes = [
  { path: '/', name: 'home', component: ListView },
  { path: '/detail/:imdbID', name: 'detail', component: DetailView, props: true },
  { path: '/admin', name: 'admin', component: AdminView },
  { path: '/:pathMatch(.*)*', redirect: { name: 'home' } }
];
const router = createRouter({ history: createWebHashHistory(), routes });

// ===== Init =====
createApp(AppShell).use(router).mount('#app');