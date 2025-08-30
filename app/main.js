// Cartelera de Cine – Vue 3 + Vue Router
// Carlos Eduardo Hernández Lecointe – 1890-18-17646

const { createApp, ref, computed, watch } = Vue;
const { createRouter, createWebHashHistory, useRoute, useRouter, RouterLink, RouterView } = VueRouter;

const API = 'https://movie.azurewebsites.net/api/cartelera';

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
    setup(props) {
        const title = computed(() => props.item.Title || props.item.title || props.item.Nombre || 'Película');
        const imdbID = computed(() => props.item.imdbID ?? props.item.imdbId ?? props.item.id ?? '');
        const poster = computed(() => getPosterUrl(props.item));
        const fields = computed(() => props.item);
        return { title, imdbID, poster, fields, truncate, asText };
    },
    template: `
    <article class="card h-100 shadow-sm">
      <img v-if="poster" :src="poster" :alt="'Poster de ' + title" class="card-img-top" @error="$event.target.style.display='none'">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong class="h6 mb-0">{{ title }}</strong>
          <RouterLink v-if="imdbID" :to="{name:'detail', params:{imdbID}}" class="btn btn-sm btn-outline-info">Ver detalle</RouterLink>
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
                // ← FUSIÓN con localStorage
                items.value = composeListWithLocal(data, { title: title.value, ubication: ubication.value });
            } catch (e) { error.value = e.message; }
            finally { loading.value = false; }
        };


        const onSubmit = () => {
            router.replace({
                name: 'home', query: {
                    title: title.value.trim(),
                    ubication: ubication.value.trim()
                }
            });
        };

        // 🔹 Botón Limpiar: deja ambos filtros vacíos y relanza la consulta
        const clearFilters = () => {
            title.value = '';
            ubication.value = '';
            router.replace({ name: 'home', query: { title: '', ubication: '' } });
        };

        watch(() => route.query, fetchList, { immediate: true });

        return { title, ubication, loading, error, items, onSubmit, clearFilters };
    },
    template: `
    <section class="container container-narrow py-3">
      <form class="row g-3 align-items-end" @submit.prevent="onSubmit">
        <div class="col-12 col-md-5">
          <label for="title" class="form-label mb-1">Título (<code>title</code>)</label>
          <input id="title" v-model="title" type="text" class="form-control" placeholder="Ej: Batman" />
        </div>
        <div class="col-12 col-md-5">
          <label for="ubication" class="form-label mb-1">Ubicación (<code>ubication</code>)</label>
          <input id="ubication" v-model="ubication" type="text" class="form-control" placeholder="Ej: OKLAN" />
        </div>
        <div class="col-12 col-md-2 d-flex gap-2">
          <button class="btn btn-primary flex-grow-1" type="submit">Buscar</button>
          <!-- Aquí va el Limpiar -->
          <button class="btn btn-outline-secondary flex-grow-1" type="button" @click="clearFilters">
            Limpiar
          </button>
        </div>
      </form>

      <div v-if="loading" class="alert state mt-3"><span class="text-secondary">Cargando cartelera…</span></div>
      <div v-else-if="error" class="alert state error mt-3">Error al cargar: {{ error }}</div>
      <div v-else-if="items.length===0" class="alert state ok mt-3">No hay resultados para los criterios ingresados.</div>

      <section class="row g-3 mt-2">
        <div class="col-12 col-sm-6 col-md-4" v-for="it in items" :key="it.imdbID || it.imdbId || it.id">
          <MovieCard :item="it" />
        </div>
      </section>
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
                let raw = null;
                try {
                    const url = buildDetailURL(imdbID.value);
                    const res = await fetch(url);
                    // Si la API responde 404 u otro error, NO lanzamos; dejamos raw = null
                    if (res.ok) raw = await res.json();
                } catch { /* ignoramos fetch error para poder caer a adds */ }

                const base = Array.isArray(raw) ? (raw?.[0] ?? null) : raw;
                movie.value = composeDetailWithLocal(base, imdbID.value);
            } catch (e) {
                error.value = e.message;
            } finally {
                loading.value = false;
            }
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
        <small>Vue 3 + Bootstrap 5 · Consumo de API REST · Filtros por query y detalle por <code>imdbID</code></small>
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

    // 🔹 Nuevo helper: obtener una película agregada por ID
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

    // 🔹 Nuevo helper: saber si un id está eliminado
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

const AdminView = {
    name: 'AdminView',
    setup() {
        const router = useRouter();

        // Formularios
        const formAdd = ref({ imdbID: '', Title: '', Year: '', Type: '', Ubication: '', description: '', Poster: '' });
        const formEditId = ref('');
        const formEdit = ref(null);
        const message = ref('');
        const error = ref('');

        const loadForEdit = async () => {
            error.value = ''; message.value = ''; formEdit.value = null;
            const id = formEditId.value.trim();
            if (!id) { error.value = 'Ingresa un imdbID para editar'; return; }

            // 1) intenta API
            let raw = null;
            try {
                const res = await fetch(buildDetailURL(id));
                if (res.ok) {
                    const data = await res.json();
                    raw = Array.isArray(data) ? (data[0] || null) : data;
                }
            } catch { /* ignorar */ }

            // 2) si no hay en API, intenta en agregadas locales
            if (!raw) raw = store.getAdd(id);
            if (!raw) { error.value = 'No encontrado (o eliminado localmente).'; return; }

            // 3) aplica overrides si existieran
            const merged = composeDetailWithLocal(raw, id);
            formEdit.value = {
                imdbID: merged.imdbID ?? merged.imdbId ?? merged.id ?? id,
                Title: merged.Title ?? merged.title ?? '',
                Year: merged.Year ?? merged.year ?? '',
                Type: merged.Type ?? merged.type ?? '',
                Ubication: merged.Ubication ?? merged.ubication ?? merged.ubicacion ?? '',
                Poster: getPosterUrl(merged) ?? '',
                description: merged.description ?? merged.Descripcion ?? merged.Descripción ?? ''
            };
        };

        const saveAdd = () => {
            try {
                const m = { ...formAdd.value };
                if (!m.imdbID) throw new Error('imdbID es obligatorio');
                store.addMovie(m);
                message.value = `Película agregada localmente: ${m.imdbID}`;
                formAdd.value = { imdbID: '', Title: '', Year: '', Type: '', Ubication: '', description: '', Poster: '' };
            } catch (e) { error.value = e.message; }
        };

        const saveEdit = () => {
            try {
                if (!formEdit.value?.imdbID) throw new Error('imdbID es obligatorio');
                const id = String(formEdit.value.imdbID);

                // Si la película fue AGREGADA localmente, actualizamos la add
                if (store.getAdd(id)) {
                    const curAdds = store.getAdds();
                    curAdds[id] = { ...curAdds[id], ...formEdit.value };
                    saveJSON(STORAGE_KEYS.adds, curAdds);
                } else {
                    // Si viene de la API, guardamos override
                    store.setOverride(id, { ...formEdit.value });
                }
                message.value = `Cambios guardados para ${id}`;
            } catch (e) { error.value = e.message; }
        };

        const doDelete = () => {
            try {
                const id = (formEditId.value.trim() || formEdit.value?.imdbID || '').trim();
                if (!id) throw new Error('indica imdbID');

                // Si es una 'add', la quitamos del listado de agregadas (borrado real)
                if (store.getAdd(id)) {
                    store.removeAdd(id);
                    message.value = `Eliminada del almacenamiento local: ${id}`;
                } else {
                    // Si es una de la API, la marcamos como eliminada (soft-delete)
                    store.delete(id);
                    message.value = `Marcada como eliminada: ${id}`;
                }
            } catch (e) { error.value = e.message; }
        };


        const undoDelete = () => {
            try {
                const id = formEditId.value.trim() || formEdit.value?.imdbID;
                if (!id) throw new Error('indica imdbID');
                store.undelete(id);
                message.value = `Eliminación revertida: ${id}`;
            } catch (e) { error.value = e.message; }
        };

        const resetAll = () => {
            if (confirm('¿Borrar TODAS las modificaciones locales?')) {
                store.resetAll();
                message.value = 'Se limpiaron overrides, agregados y eliminados locales.';
            }
        };

        return { formAdd, formEditId, formEdit, message, error, loadForEdit, saveAdd, saveEdit, doDelete, undoDelete, resetAll };
    },
    template: `
    <section class="container container-narrow py-3">
      <RouterLink :to="{name:'home'}" class="link-accent d-inline-block mb-3">← Volver</RouterLink>
      <h2 class="h4 mb-3">Administración local (sin tocar la API)</h2>
      <p class="text-secondary">Estos cambios se guardan en <code>localStorage</code> y se fusionan con los datos de la API. Útiles para pruebas o demos.</p>

      <div v-if="message" class="alert state ok my-2">{{ message }}</div>
      <div v-if="error" class="alert state error my-2">Error: {{ error }}</div>

      <div class="row g-3">
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
              <button class="btn btn-outline-secondary" @click="resetAll" type="button">Reset local</button>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-6">
          <div class="card p-3">
            <h3 class="h5">Editar / Eliminar por imdbID</h3>
            <div class="row g-2 align-items-end">
              <div class="col-8"><label class="form-label">imdbID</label><input v-model="formEditId" class="form-control" placeholder="Ej: 80001"></div>
              <div class="col-4"><button class="btn btn-primary w-100" @click="loadForEdit" type="button">Cargar</button></div>
            </div>

            <template v-if="formEdit">
              <hr>
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
                <button class="btn btn-outline-secondary" @click="undoDelete" type="button">Revertir eliminación</button>
                <button class="btn btn-outline-danger" @click="doDelete" type="button">Eliminar (local)</button>
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