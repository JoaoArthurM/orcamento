/* ══════════════════════════════════════════════════════
   orçamento. — camada de dados

   Local-first: o localStorage é a verdade imediata (o app abre e
   funciona offline), e o Supabase é a cópia compartilhada entre
   aparelhos. O app continua entregando o array inteiro de entradas;
   é aqui que ele vira INSERT/UPDATE/DELETE por linha.

   Sem credenciais em config.js — ou com a biblioteca indisponível —
   tudo continua funcionando em modo local, sem login.
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const PREFIX     = 'orcamento:v2:';
  const LEGACY_V1  = 'orcamento:state:v1';
  const LEGACY_SIM = 'sim-state';

  const TYPES_OK = ['fs','os','ci','ui','em','co'];

  let client   = null;     // cliente supabase-js (null = modo local)
  let user     = null;     // usuário logado
  let scope    = 'local';  // sufixo das chaves do localStorage
  let synced   = null;     // último estado confirmado no servidor
  let dirty    = false;    // há mudanças locais ainda não enviadas
  let pushing  = false;
  let channel  = null;
  let onRemote = null;     // callback quando outro aparelho grava
  let onStatus = null;     // callback de status ('sincronizando'/'ok'/'offline'…)

  const REMEMBER_KEY = 'orcamento:remember';

  /**
   * Guarda a sessão no localStorage quando "Lembrar" está marcado
   * (sobrevive a fechar o app) e no sessionStorage quando não está
   * (some ao fechar a aba). A leitura procura nos dois.
   */
  const sessionStore = {
    _remember() {
      try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch (e) { return true; }
    },
    _target() {
      try { return this._remember() ? localStorage : sessionStorage; }
      catch (e) { return localStorage; }
    },
    getItem(key) {
      try { const v = sessionStorage.getItem(key); if (v !== null) return v; } catch (e) {}
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    setItem(key, value) {
      try { this._target().setItem(key, value); } catch (e) {}
      // evita a sessão ficar duplicada nos dois lugares
      try {
        const other = this._remember() ? sessionStorage : localStorage;
        other.removeItem(key);
      } catch (e) {}
    },
    removeItem(key) {
      try { localStorage.removeItem(key); } catch (e) {}
      try { sessionStorage.removeItem(key); } catch (e) {}
    },
  };

  /* ── util ───────────────────────────────────────────── */
  const kState  = () => PREFIX + scope + ':state';
  const kSynced = () => PREFIX + scope + ':synced';

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function isUuid(v) {
    return typeof v === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  }
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // fallback para navegadores sem randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  }

  function validEntry(e) {
    return !!e && typeof e === 'object'
      && typeof e.name === 'string'
      && TYPES_OK.indexOf(e.type) >= 0;
  }

  /** Normaliza uma entrada vinda de qualquer origem (semente, import, nuvem). */
  function normalize(e) {
    const out = {
      id:     isUuid(e.id) ? e.id : newId(),
      name:   String(e.name).slice(0, 120),
      type:   e.type,
      hidden: !!e.hidden,
    };
    if (e.type === 'ui') {
      out.min_amount    = Number(e.min_amount) || 0;
      out.max_amount    = Number(e.max_amount) || 0;
      out.may_not_occur = !!e.may_not_occur;
    } else {
      out.amount = Number(e.amount) || 0;
    }
    if (e.type !== 'fs') {
      out.months = Array.isArray(e.months)
        ? e.months.map(Number).filter(function (m) { return m >= 1 && m <= 12; })
        : [];
    }
    return out;
  }

  /* ── mapeamento app ⇄ banco ─────────────────────────── */
  function toRow(e, index) {
    return {
      id:            e.id,
      user_id:       user.id,
      name:          e.name,
      type:          e.type,
      hidden:        !!e.hidden,
      position:      index,
      amount:        e.type === 'ui' ? null : (Number(e.amount) || 0),
      min_amount:    e.type === 'ui' ? (Number(e.min_amount) || 0) : null,
      max_amount:    e.type === 'ui' ? (Number(e.max_amount) || 0) : null,
      may_not_occur: e.type === 'ui' ? !!e.may_not_occur : false,
      months:        e.type === 'fs' ? [] : (e.months || []),
    };
  }

  function fromRow(r) {
    const e = { id: r.id, name: r.name, type: r.type, hidden: !!r.hidden };
    if (r.type === 'ui') {
      e.min_amount    = Number(r.min_amount) || 0;
      e.max_amount    = Number(r.max_amount) || 0;
      e.may_not_occur = !!r.may_not_occur;
    } else {
      e.amount = Number(r.amount) || 0;
    }
    if (r.type !== 'fs') e.months = (r.months || []).map(Number);
    return e;
  }

  /** Compara duas entradas já normalizadas, incluindo a posição. */
  function sameRow(a, b) {
    return JSON.stringify(toRow(a, a.__pos)) === JSON.stringify(toRow(b, b.__pos));
  }

  /* ── cache local ────────────────────────────────────── */
  function readLocal() {
    const raw = lsGet(kState());
    if (raw) {
      try {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.entries)) {
          return {
            entries: d.entries.filter(validEntry).map(normalize),
            saldoInicial: Number(d.saldoInicial) || 0,
          };
        }
      } catch (e) {}
    }
    return null;
  }

  function readLegacy() {
    for (const key of [LEGACY_V1, LEGACY_SIM]) {
      const raw = lsGet(key);
      if (!raw) continue;
      try {
        const d = JSON.parse(raw);
        if (!d || !Array.isArray(d.entries)) continue;
        const clean = d.entries.filter(validEntry).map(normalize);
        if (!clean.length && d.entries.length) continue;   // blob corrompido
        return { entries: clean, saldoInicial: Number(d.saldoInicial) || 0 };
      } catch (e) {}
    }
    return null;
  }

  function writeLocal(state) {
    return lsSet(kState(), JSON.stringify({
      v: 2, entries: state.entries, saldoInicial: state.saldoInicial, savedAt: Date.now(),
    }));
  }

  function readSynced() {
    const raw = lsGet(kSynced());
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.entries)) return d;
    } catch (e) {}
    return null;
  }
  function writeSynced(state) {
    synced = state ? clone(state) : null;
    if (state) lsSet(kSynced(), JSON.stringify(state));
    else lsDel(kSynced());
  }

  /* ── status ─────────────────────────────────────────── */
  function status(txt, kind) { if (onStatus) onStatus(txt, kind); }

  /* ══════════════════════════════════════════════════════
     SINCRONIZAÇÃO
     ══════════════════════════════════════════════════════ */

  /** Baixa o estado da nuvem. Devolve null se não houver nada lá. */
  async function pull() {
    const er = await client.from('entries')
      .select('*').eq('user_id', user.id).order('position', { ascending: true });
    if (er.error) throw er.error;

    const sr = await client.from('settings')
      .select('saldo_inicial').eq('user_id', user.id).maybeSingle();
    if (sr.error) throw sr.error;

    if (!er.data.length && !sr.data) return null;      // conta ainda vazia
    return {
      entries: er.data.map(fromRow),
      saldoInicial: sr.data ? (Number(sr.data.saldo_inicial) || 0) : 0,
    };
  }

  /**
   * Envia as diferenças entre `state` e o último estado confirmado.
   * Como o diff sempre parte de `synced`, uma tentativa que falhou
   * é recuperada só chamando push() de novo — não há fila a manter.
   */
  async function push(state) {
    if (!client || !user || pushing) return;
    pushing = true;
    try {
      const prev = synced ? synced.entries : [];
      const prevById = {};
      prev.forEach(function (e, i) { e.__pos = i; prevById[e.id] = e; });

      const upserts = [];
      state.entries.forEach(function (e, i) {
        e.__pos = i;
        const old = prevById[e.id];
        if (!old || !sameRow(old, e)) upserts.push(toRow(e, i));
      });

      const nextIds = {};
      state.entries.forEach(function (e) { nextIds[e.id] = true; });
      const deletes = prev.filter(function (e) { return !nextIds[e.id]; })
                          .map(function (e) { return e.id; });

      const saldoChanged = !synced || synced.saldoInicial !== state.saldoInicial;

      if (!upserts.length && !deletes.length && !saldoChanged) {
        dirty = false; status('salvo ✓', 'ok');
        return;
      }

      status('sincronizando…', 'saving');

      if (deletes.length) {
        const r = await client.from('entries').delete()
          .eq('user_id', user.id).in('id', deletes);
        if (r.error) throw r.error;
      }
      if (upserts.length) {
        const r = await client.from('entries').upsert(upserts, { onConflict: 'id' });
        if (r.error) throw r.error;
      }
      if (saldoChanged) {
        const r = await client.from('settings')
          .upsert({ user_id: user.id, saldo_inicial: state.saldoInicial }, { onConflict: 'user_id' });
        if (r.error) throw r.error;
      }

      writeSynced({ entries: clone(state.entries), saldoInicial: state.saldoInicial });
      dirty = false;
      status('salvo ✓', 'ok');
    } catch (err) {
      dirty = true;
      status(navigator.onLine ? 'erro ao sincronizar' : 'offline — salvo aqui',
             navigator.onLine ? 'err' : 'readonly');
      if (window.console) console.warn('[orçamento] falha ao sincronizar:', err.message || err);
    } finally {
      pushing = false;
    }
  }

  /* realtime — outro aparelho gravou */
  let remoteTimer = null;
  function subscribe() {
    if (!client || !user || channel) return;
    channel = client.channel('orcamento:' + user.id)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'entries', filter: 'user_id=eq.' + user.id },
          scheduleRemote)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'settings', filter: 'user_id=eq.' + user.id },
          scheduleRemote)
      .subscribe();
  }
  function scheduleRemote() {
    // Enquanto houver mudança local pendente, o que está aqui é mais novo:
    // buscar agora sobrescreveria a edição do usuário.
    if (dirty || pushing) return;
    clearTimeout(remoteTimer);
    remoteTimer = setTimeout(async function () {
      if (dirty || pushing) return;
      try {
        const remote = await pull();
        if (!remote) return;
        writeSynced(remote);
        writeLocal(remote);
        if (onRemote) onRemote(remote);
      } catch (e) {}
    }, 400);
  }
  function unsubscribe() {
    if (channel) { try { client.removeChannel(channel); } catch (e) {} channel = null; }
  }

  /* ══════════════════════════════════════════════════════
     API PÚBLICA
     ══════════════════════════════════════════════════════ */
  const Store = {

    /** 'cloud' quando há Supabase configurado e disponível; senão 'local'. */
    mode: 'local',
    newId: newId,
    normalize: normalize,
    validEntry: validEntry,

    onRemoteChange(fn) { onRemote = fn; },
    onStatusChange(fn) { onStatus = fn; },

    /** Cria o cliente. Falha silenciosa cai para o modo local. */
    init() {
      const cfg = window.ORCAMENTO_CONFIG || {};
      if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
        this.mode = 'local';
        return false;
      }
      try {
        client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: sessionStore,
          },
        });
        this.mode = 'cloud';
        return true;
      } catch (e) {
        client = null;
        this.mode = 'local';
        return false;
      }
    },

    get user() { return user; },
    get isDirty() { return dirty; },

    /** "Lembrar" — define onde a sessão fica guardada. */
    get remember() {
      try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch (e) { return true; }
    },
    setRemember(on) {
      try { localStorage.setItem(REMEMBER_KEY, on ? '1' : '0'); } catch (e) {}
    },

    /* ── autenticação ─────────────────────────────────── */
    async currentSession() {
      if (!client) return null;
      try {
        const { data } = await client.auth.getSession();
        return data.session || null;
      } catch (e) { return null; }
    },

    onAuthChange(fn) {
      if (!client) return;
      client.auth.onAuthStateChange(function (event, session) {
        fn(event, session);
      });
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({
        email, password,
        options: { emailRedirectTo: location.href.split('#')[0].split('?')[0] },
      });
      if (error) throw error;
      // sem sessão = o projeto exige confirmação por e-mail
      return { needsConfirmation: !data.session, data };
    },

    async sendReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: location.href.split('#')[0].split('?')[0],
      });
      if (error) throw error;
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },

    async signOut() {
      unsubscribe();
      try { await client.auth.signOut(); } catch (e) {}
      user = null;
      scope = 'local';
      synced = null;
      dirty = false;
    },

    /* ── ciclo de vida dos dados ──────────────────────── */

    /** Define o usuário e passa a usar as chaves locais dele. */
    setUser(u) {
      user = u || null;
      scope = user ? user.id : 'local';
      synced = readSynced();
    },

    /** Estado para desenhar a tela agora, sem esperar a rede. */
    localState() {
      return readLocal();
    },

    /** Estado legado (localStorage anterior ao login), para migrar. */
    legacyState() {
      return readLegacy();
    },

    /**
     * Reconcilia nuvem e aparelho no login.
     *  - nuvem tem dados          → a nuvem vence
     *  - nuvem vazia + dados aqui → sobem para a nuvem
     *  - tudo vazio               → devolve null (o app semeia)
     */
    async reconcile(localFallback) {
      if (this.mode !== 'cloud' || !user) return { state: readLocal(), source: 'local' };
      try {
        status('sincronizando…', 'saving');
        const remote = await pull();
        if (remote) {
          writeSynced(remote);
          writeLocal(remote);
          status('salvo ✓', 'ok');
          return { state: remote, source: 'cloud' };
        }
        const local = readLocal() || localFallback;
        if (local && local.entries.length) {
          writeSynced({ entries: [], saldoInicial: null });   // força enviar tudo
          await push(local);
          return { state: local, source: 'uploaded' };
        }
        writeSynced({ entries: [], saldoInicial: 0 });
        return { state: null, source: 'empty' };
      } catch (err) {
        status('offline — usando dados deste aparelho', 'readonly');
        if (window.console) console.warn('[orçamento] sem conexão com o Supabase:', err.message || err);
        return { state: readLocal(), source: 'offline' };
      }
    },

    /** O app chama isto a cada mudança, sempre com o estado completo. */
    save(entries, saldoInicial) {
      const state = { entries: entries, saldoInicial: saldoInicial };
      const ok = writeLocal(state);
      if (this.mode !== 'cloud' || !user) {
        status(ok ? 'salvo ✓' : 'erro ao salvar', ok ? 'ok' : 'err');
        return;
      }
      dirty = true;
      push(state);
    },

    /** Reenvia o que ficou pendente (volta da conexão, app reaberto). */
    retry(entries, saldoInicial) {
      if (this.mode !== 'cloud' || !user || !dirty) return;
      push({ entries: entries, saldoInicial: saldoInicial });
    },

    /** Apaga os dados deste usuário — aqui e na nuvem. */
    async wipe() {
      lsDel(kState());
      lsDel(kSynced());
      lsDel(LEGACY_V1);
      lsDel(LEGACY_SIM);
      synced = null;
      dirty = false;
      if (this.mode === 'cloud' && user) {
        try {
          await client.from('entries').delete().eq('user_id', user.id);
          await client.from('settings').delete().eq('user_id', user.id);
          writeSynced({ entries: [], saldoInicial: 0 });
        } catch (e) {
          if (window.console) console.warn('[orçamento] falha ao apagar na nuvem:', e.message || e);
          throw e;
        }
      }
    },

    startRealtime() { subscribe(); },
    stopRealtime()  { unsubscribe(); },
  };

  window.Store = Store;
})();
