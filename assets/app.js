(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const cfg = window.PORTAL_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey) &&
    cfg.supabaseUrl.indexOf("COLE_AQUI") < 0 && cfg.supabaseAnonKey.indexOf("COLE_AQUI") < 0;

  // Links de convite e de nova senha chegam com parâmetros no "#" da URL.
  // Lidos antes de o cliente Supabase consumir o endereço.
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
  const linkType = hashParams.get("type");
  const linkError = hashParams.get("error_description") || hashParams.get("error");
  const hasAuthHash = hashParams.has("access_token") || !!linkError;

  const STASH_KEY = "copplasa-portal-rascunho";
  const GRUPOS = ["Saúde e benefícios", "Outros seguros"];

  const SCHEMA = [
    { key: "portal", label: "Boas-vindas", single: true, fields: [
      { k: "boasVindas", label: "Texto de boas-vindas", type: "textarea" }] },
    { key: "avisos", label: "Avisos", noun: "aviso", req: "titulo", fields: [
      { k: "data", label: "Data", type: "date" },
      { k: "titulo", label: "Título", type: "text" },
      { k: "texto", label: "Texto", type: "textarea" },
      { k: "exemplo", label: "Marcar como exemplo", type: "check" }],
      blank: () => ({ data: todayISO(), titulo: "", texto: "", exemplo: false }) },
    { key: "produtos", label: "Produtos", noun: "produto", req: "nome", fields: [
      { k: "grupo", label: "Grupo", type: "select", options: GRUPOS },
      { k: "nome", label: "Nome do produto", type: "text" },
      { k: "resumo", label: "Resumo", type: "textarea" },
      { k: "pontos", label: "Pontos de atenção (um por linha)", type: "textarea" }],
      blank: () => ({ grupo: GRUPOS[0], nome: "", resumo: "", pontos: "" }) },
    { key: "carencias", label: "Carências", noun: "prazo", req: "prazo", fields: [
      { k: "prazo", label: "Prazo (ex.: 180 dias)", type: "text" },
      { k: "descricao", label: "Para quais coberturas", type: "text" }],
      blank: () => ({ prazo: "", descricao: "" }) },
    { key: "faq", label: "Dúvidas", noun: "pergunta", req: "pergunta", fields: [
      { k: "pergunta", label: "Pergunta", type: "text" },
      { k: "resposta", label: "Resposta", type: "textarea" }],
      blank: () => ({ pergunta: "", resposta: "" }) },
    { key: "links", label: "Links", noun: "link", req: "titulo", fields: [
      { k: "titulo", label: "Título", type: "text" },
      { k: "descricao", label: "Descrição", type: "textarea" },
      { k: "url", label: "Endereço (https://...)", type: "url" }],
      blank: () => ({ titulo: "", descricao: "", url: "" }) },
    { key: "contatos", label: "Contatos", noun: "contato", req: "area", fields: [
      { k: "area", label: "Área", type: "text" },
      { k: "canal", label: "Telefone ou e-mail", type: "text" },
      { k: "horario", label: "Horário de atendimento", type: "text" },
      { k: "exemplo", label: "Marcar como exemplo", type: "check" }],
      blank: () => ({ area: "", canal: "", horario: "", exemplo: false }) }
  ];

  // ---------- Utilitários ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const uid = () => "i" + Math.random().toString(36).slice(2, 9);
  function todayISO() {
    const t = new Date();
    return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function paras(s) {
    return String(s || "").split(/\n+/).map((t) => t.trim()).filter(Boolean).map((t) => "<p>" + esc(t) + "</p>").join("");
  }
  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
  }
  function fmtTimestamp(ts) {
    const d = ts ? new Date(ts) : null;
    return d && !isNaN(d) ? d.toLocaleDateString("pt-BR") : "";
  }
  function safeUrl(u) {
    u = String(u || "").trim();
    return /^https?:\/\/\S+$/i.test(u) ? u : "";
  }
  function hostOf(u) {
    try { return new URL(u).host.replace(/^www\./, ""); } catch (_) { return ""; }
  }
  function normalize(d) {
    if (!d || typeof d !== "object") d = {};
    if (!d.portal || typeof d.portal !== "object") d.portal = { boasVindas: "" };
    SCHEMA.forEach((s) => {
      if (s.single) return;
      if (!Array.isArray(d[s.key])) d[s.key] = [];
      d[s.key].forEach((it) => { if (!it.id) it.id = uid(); });
    });
    return d;
  }
  let toastTimer = 0;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  // ---------- Estado ----------
  let sb = null;
  let session = null;
  let state = null;
  let loadedAt = null;
  let draft = null;
  let edTab = "avisos";
  let canEdit = false;
  let busy = false;
  let statusLocked = false;
  let newPassMode = "change";

  // ---------- Telas ----------
  function showView(name) {
    ["loading", "auth", "portal"].forEach((v) => { $("#view-" + v).hidden = v !== name; });
  }
  function showForm(name) {
    showView("auth");
    ["login", "forgot", "newpass", "setup"].forEach((f) => { $("#auth-" + f).hidden = f !== name; });
    const first = $("#auth-" + name + " input:not([hidden])");
    if (first) first.focus();
  }
  function formMsg(form, text, kind) {
    const el = $("#auth-" + form + " .form-msg");
    el.textContent = text || "";
    el.className = "form-msg" + (kind ? " " + kind : "");
  }
  function formBusy(form, on) {
    $("#auth-" + form).querySelectorAll("button, input").forEach((el) => { el.disabled = on; });
  }
  function authErrorText(err) {
    const code = String((err && err.code) || "");
    const msg = String((err && err.message) || "").toLowerCase();
    const status = err && err.status;
    if (code === "invalid_credentials" || msg.indexOf("invalid login credentials") >= 0) return "E-mail ou senha incorretos.";
    if (code === "email_not_confirmed" || msg.indexOf("email not confirmed") >= 0) return "Este acesso ainda não foi confirmado. Fale com a equipe Copplasa.";
    if (status === 429 || code.indexOf("rate_limit") >= 0) return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
    if (code === "weak_password" || msg.indexOf("password should") >= 0) return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
    if (code === "same_password" || msg.indexOf("different from the old") >= 0) return "A nova senha precisa ser diferente da atual.";
    if (code === "user_banned") return "Este acesso está bloqueado. Fale com a equipe Copplasa.";
    if (msg.indexOf("fetch") >= 0 || msg.indexOf("network") >= 0) return "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
    return "Não foi possível concluir. Tente de novo em instantes.";
  }
  function openNewPass(mode) {
    newPassMode = mode;
    const titles = { invite: "Crie sua senha", recovery: "Crie uma nova senha", change: "Alterar senha" };
    $("#newpass-title").textContent = titles[mode] || titles.change;
    $("#newpass-sub").textContent = mode === "invite"
      ? "Bem-vindo ao Portal Copplasa. Defina a senha que você vai usar para entrar. Use pelo menos 8 caracteres, misturando letras e números."
      : "Use pelo menos 8 caracteres, misturando letras e números.";
    $("#newpass-user").value = (session && session.user && session.user.email) || "";
    $("#newpass-cancel").hidden = mode !== "change";
    $("#newpass-1").value = ""; $("#newpass-2").value = "";
    formMsg("newpass", "");
    showForm("newpass");
  }

  // ---------- Página ----------
  const EX = '<span class="chip" title="Conteúdo de exemplo. Revise antes de usar.">Exemplo</span>';
  function head(id, title, sub) {
    return '<div class="sec-head"><h2 id="h-' + id + '">' + esc(title) + "</h2>" + (sub ? '<p class="sec-sub">' + esc(sub) + "</p>" : "") + "</div>";
  }
  function secAvisos(d) {
    const items = d.avisos.slice().sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    const body = items.length
      ? '<div class="avisos">' + items.map((a) =>
          '<article class="aviso"><div class="aviso-date">' + esc(fmtDate(a.data)) + '</div><div class="aviso-body"><h3>' +
          "<span>" + esc(a.titulo) + "</span>" + (a.exemplo ? EX : "") + "</h3>" + paras(a.texto) + "</div></article>").join("") + "</div>"
      : '<p class="empty">Nenhum aviso publicado no momento.</p>';
    return '<section id="avisos" aria-labelledby="h-avisos">' + head("avisos", "Avisos", "Comunicados para clientes, parceiros e equipe.") + body + "</section>";
  }
  function card(p) {
    const pts = String(p.pontos || "").split("\n").map((t) => t.trim()).filter(Boolean);
    return '<article class="card"><h4>' + esc(p.nome) + "</h4>" + (p.resumo ? "<p>" + esc(p.resumo) + "</p>" : "") +
      (pts.length ? "<ul>" + pts.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>" : "") + "</article>";
  }
  function prazos(d) {
    if (!d.carencias.length) return "";
    return '<div class="prazos"><div class="prazos-head"><h4>Prazos máximos de carência em planos de saúde</h4><p class="prazos-src">Lei 9.656/1998, art. 12</p></div>' +
      '<div class="prazos-grid">' + d.carencias.map((c) => {
        const m = /^\s*(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(c.prazo || "");
        const num = m ? esc(m[1]) + (m[2] ? '<span class="prazo-unit">' + esc(m[2]) + "</span>" : "") : esc(c.prazo);
        return '<div class="prazo"><div class="prazo-num">' + num + '</div><div class="prazo-txt">' + esc(c.descricao) + "</div></div>";
      }).join("") + '</div><p class="prazos-foot">O contrato pode prever prazos menores ou nenhuma carência.</p></div>';
  }
  function secProdutos(d) {
    const extras = [];
    d.produtos.forEach((p) => { if (p.grupo && GRUPOS.indexOf(p.grupo) < 0 && extras.indexOf(p.grupo) < 0) extras.push(p.grupo); });
    let html = "";
    GRUPOS.concat(extras).forEach((g) => {
      const ps = d.produtos.filter((p) => (p.grupo || GRUPOS[1]) === g);
      const showPrazos = g === GRUPOS[0] && d.carencias.length;
      if (!ps.length && !showPrazos) return;
      html += '<div class="group"><h3 class="group-title">' + esc(g) + "</h3>" +
        (ps.length ? '<div class="cards">' + ps.map(card).join("") + "</div>" : "") +
        (showPrazos ? prazos(d) : "") + "</div>";
    });
    if (!html) html = '<p class="empty">Nenhum produto cadastrado.</p>';
    return '<section id="produtos" aria-labelledby="h-produtos">' + head("produtos", "Produtos", "Saúde e benefícios são o foco da Copplasa, com outros seguros para pessoas e empresas.") + html + "</section>";
  }
  function secFaq(d) {
    const body = d.faq.length
      ? '<div class="faq">' + d.faq.map((f) => '<details class="qa"><summary>' + esc(f.pergunta) + '</summary><div class="ans">' + paras(f.resposta) + "</div></details>").join("") + "</div>"
      : '<p class="empty">Nenhuma pergunta cadastrada.</p>';
    return '<section id="duvidas" aria-labelledby="h-duvidas">' + head("duvidas", "Dúvidas frequentes", "") + body +
      '<p class="note">Respostas gerais. As regras de cada contrato dependem da operadora ou da seguradora. Em caso de dúvida, fale com a equipe técnica da Copplasa.</p></section>';
  }
  function secLinks(d) {
    const body = d.links.length
      ? '<ul class="links">' + d.links.map((l) => {
          const u = safeUrl(l.url);
          const t = u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(l.titulo) + "</a>"
                      : '<span class="ltitle">' + esc(l.titulo) + "</span>";
          return "<li>" + t + (l.descricao ? "<p>" + esc(l.descricao) + "</p>" : "") +
            (u ? '<span class="host">' + esc(hostOf(u)) + "</span>" : '<span><span class="chip">Link a cadastrar</span></span>') + "</li>";
        }).join("") + "</ul>"
      : '<p class="empty">Nenhum link cadastrado.</p>';
    return '<section id="links" aria-labelledby="h-links">' + head("links", "Links úteis", "") + body + "</section>";
  }
  function secContatos(d) {
    const body = d.contatos.length
      ? '<div class="contacts">' + d.contatos.map((c) =>
          '<article class="contact"><h3><span>' + esc(c.area) + "</span>" + (c.exemplo ? EX : "") + "</h3>" +
          (c.canal ? '<div class="canal-row"><span class="canal">' + esc(c.canal) + "</span>" +
            (c.exemplo ? "" : '<button type="button" class="btn btn-ghost btn-sm" data-copy="' + esc(c.canal) + '">Copiar</button>') + "</div>" : "") +
          (c.horario ? '<p class="horario">' + esc(c.horario) + "</p>" : "") + "</article>").join("") + "</div>"
      : '<p class="empty">Nenhum contato cadastrado.</p>';
    return '<section id="contatos" aria-labelledby="h-contatos">' + head("contatos", "Contatos", "") + body + "</section>";
  }
  function renderContent(d) {
    $("#lede").textContent = d.portal.boasVindas || "";
    $("#stamp-date").textContent = fmtTimestamp(loadedAt) || "data não informada";
    $("#conteudo").innerHTML = secAvisos(d) + secProdutos(d) + secFaq(d) + '<div class="split">' + secLinks(d) + secContatos(d) + "</div>";
  }

  // ---------- Entrar no portal ----------
  async function enterPortal(s) {
    session = s;
    $("#who-name").textContent = (s.user && s.user.email) || "";
    showView("portal");
    $("#lede").textContent = "";
    $("#stamp-date").textContent = "...";
    $("#conteudo").innerHTML = '<p class="empty">Carregando conteúdo...</p>';
    let content, editor;
    try {
      [content, editor] = await Promise.all([
        sb.from("portal_conteudo").select("dados, atualizado_em").eq("id", 1).maybeSingle(),
        sb.from("portal_editores").select("user_id").eq("user_id", s.user.id).maybeSingle()
      ]);
    } catch (_) {
      content = { error: true };
    }
    if (!session) return; // saiu enquanto carregava
    if (content.error) {
      $("#stamp-date").textContent = "-";
      $("#conteudo").innerHTML = '<p class="load-err">Não foi possível carregar o conteúdo. Recarregue a página. Se o problema continuar, fale com a equipe Copplasa.</p>';
      return;
    }
    state = normalize(content.data ? content.data.dados : {});
    loadedAt = content.data ? content.data.atualizado_em : null;
    canEdit = !!(editor && !editor.error && editor.data);
    $("#open-editor").hidden = !canEdit;
    renderContent(state);
    if (canEdit) restoreStash();
  }
  function resetPortal() {
    session = null; state = null; loadedAt = null; draft = null; canEdit = false; busy = false;
    clearStash();
    $("#editor").hidden = true;
    $("#view-portal").classList.remove("with-editor");
    $("#open-editor").hidden = true;
    $("#banner").hidden = true;
    $("#conteudo").innerHTML = "";
  }

  // ---------- Rascunho ----------
  function stash() { try { if (draft) sessionStorage.setItem(STASH_KEY, JSON.stringify(draft)); } catch (_) {} }
  function clearStash() { try { sessionStorage.removeItem(STASH_KEY); } catch (_) {} }
  function readStash() { try { const s = sessionStorage.getItem(STASH_KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; } }
  function restoreStash() {
    const saved = readStash();
    if (!saved) return;
    const d = normalize(saved);
    if (same(d, state)) { clearStash(); return; }
    draft = d;
    renderContent(draft);
    syncUi();
  }
  const dirty = () => !!draft && !!state && !same(draft, state);

  let pvTimer = 0;
  function changed() {
    stash();
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => renderContent(draft || state), 150);
    syncUi();
  }
  function syncUi() {
    const open = !$("#editor").hidden;
    $("#banner").hidden = !dirty();
    $("#banner-edit").hidden = open;
    $("#ed-publish").disabled = busy || !canEdit || !dirty();
    $("#ed-discard").disabled = busy || !dirty();
    if (!busy && !statusLocked) setStatus(dirty() ? "Alterações ainda não publicadas." : "Nenhuma alteração.");
  }
  function setStatus(msg, kind, lock) {
    const el = $("#ed-status");
    el.textContent = msg;
    el.className = "ed-status" + (kind ? " " + kind : "");
    statusLocked = !!lock;
  }

  // ---------- Editor ----------
  function fieldHtml(s, i, it, f) {
    const id = "ed-" + s.key + "-" + (s.single ? "x" : it.id) + "-" + f.k;
    const data = 'data-sec="' + s.key + '" data-idx="' + (i == null ? "" : i) + '" data-field="' + f.k + '"';
    const v = it[f.k];
    if (f.type === "check") return '<label class="check" for="' + id + '"><input type="checkbox" id="' + id + '" ' + data + (v ? " checked" : "") + "> " + esc(f.label) + "</label>";
    let ctl;
    if (f.type === "textarea") ctl = '<textarea id="' + id + '" ' + data + ' rows="4">' + esc(v) + "</textarea>";
    else if (f.type === "select") ctl = '<select id="' + id + '" ' + data + ">" + f.options.map((o) => "<option" + (o === v ? " selected" : "") + ">" + esc(o) + "</option>").join("") + "</select>";
    else ctl = '<input type="' + (f.type === "date" ? "date" : f.type === "url" ? "url" : "text") + '" id="' + id + '" ' + data + ' value="' + esc(v) + '"' + (f.type === "url" ? ' placeholder="https://"' : "") + ">";
    return '<div class="field"><label for="' + id + '">' + esc(f.label) + "</label>" + ctl + "</div>";
  }
  function itemLabel(s, it, i) { return (it[s.req] || "").trim() || "Novo " + s.noun + " (" + (i + 1) + ")"; }
  function renderTabs() {
    $("#ed-tabs").innerHTML = SCHEMA.map((s) =>
      '<button type="button" class="ed-tab" data-tab="' + s.key + '" aria-pressed="' + (s.key === edTab) + '">' + esc(s.label) + "</button>").join("");
  }
  function renderEdBody() {
    const s = SCHEMA.find((x) => x.key === edTab);
    let html;
    if (s.single) {
      html = '<div class="ed-item">' + s.fields.map((f) => fieldHtml(s, null, draft.portal, f)).join("") + "</div>";
    } else {
      const list = draft[s.key];
      html = (list.length ? "" : '<p class="ed-empty">Nenhum item nesta seção.</p>') +
        list.map((it, i) =>
          '<div class="ed-item" data-item="' + i + '"><div class="ed-item-head"><span class="ed-item-title">' + esc(itemLabel(s, it, i)) + "</span>" +
          '<div class="ed-tools">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="up" data-idx="' + i + '" aria-label="Mover para cima"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="down" data-idx="' + i + '" aria-label="Mover para baixo"' + (i === list.length - 1 ? " disabled" : "") + ">↓</button>" +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="remove" data-idx="' + i + '">Remover</button>' +
          "</div></div>" + s.fields.map((f) => fieldHtml(s, i, it, f)).join("") + "</div>").join("") +
        '<button type="button" class="btn btn-ghost ed-add" data-act="add">Adicionar ' + esc(s.noun) + "</button>";
    }
    $("#ed-body").innerHTML = html;
  }
  function openEditor() {
    if (!canEdit || !state) return;
    if (!draft) draft = clone(state);
    $("#editor").hidden = false;
    $("#view-portal").classList.add("with-editor");
    renderTabs(); renderEdBody(); syncUi();
    $("#ed-title").focus();
  }
  function closeEditor() {
    $("#editor").hidden = true;
    $("#view-portal").classList.remove("with-editor");
    if (!dirty()) { draft = null; clearStash(); if (state) renderContent(state); }
    syncUi();
    if (!$("#open-editor").hidden) $("#open-editor").focus();
  }
  function onField(e) {
    const el = e.target;
    const sec = el.dataset && el.dataset.sec;
    if (!sec || !draft) return;
    const s = SCHEMA.find((x) => x.key === sec);
    const idx = el.dataset.idx === "" ? null : +el.dataset.idx;
    const target = s.single ? draft.portal : draft[sec][idx];
    if (!target) return;
    target[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
    if (!s.single && el.dataset.field === s.req) {
      const t = $('#ed-body [data-item="' + idx + '"] .ed-item-title');
      if (t) t.textContent = itemLabel(s, target, idx);
    }
    if (!busy) statusLocked = false;
    changed();
  }
  function validate(d) {
    for (const s of SCHEMA) {
      if (s.single) continue;
      for (let i = 0; i < d[s.key].length; i++) {
        const it = d[s.key][i];
        if (!String(it[s.req] || "").trim()) {
          const f = s.fields.find((x) => x.k === s.req);
          return { tab: s.key, id: "ed-" + s.key + "-" + it.id + "-" + s.req, msg: 'Preencha o campo "' + f.label + '" em ' + s.label + ", item " + (i + 1) + "." };
        }
        if (s.key === "links" && String(it.url || "").trim() && !safeUrl(it.url)) {
          return { tab: s.key, id: "ed-links-" + it.id + "-url", msg: "O endereço do link " + (i + 1) + " precisa começar com https://." };
        }
      }
    }
    return null;
  }
  async function publishDraft() {
    if (!dirty() || busy || !canEdit) return;
    const problem = validate(draft);
    if (problem) {
      edTab = problem.tab; renderTabs(); renderEdBody();
      setStatus(problem.msg, "err", true);
      const el = document.getElementById(problem.id);
      if (el) { el.focus(); el.scrollIntoView({ block: "center" }); }
      return;
    }
    stash();
    busy = true; syncUi(); setStatus("Publicando...", "", true);
    try {
      // Só grava se ninguém publicou desde que esta página carregou o conteúdo.
      let q = sb.from("portal_conteudo").update({ dados: draft }).eq("id", 1);
      if (loadedAt) q = q.eq("atualizado_em", loadedAt);
      const { data, error } = await q.select("dados, atualizado_em");
      if (error) throw error;
      if (!data || !data.length) {
        const ed = await sb.from("portal_editores").select("user_id").eq("user_id", session.user.id).maybeSingle();
        busy = false;
        if (!ed.error && !ed.data) {
          canEdit = false;
          $("#open-editor").hidden = true;
          setStatus("Seu acesso não permite editar o portal. Fale com quem administra o portal.", "err", true);
        } else {
          setStatus("Outra pessoa publicou uma versão mais nova. Recarregue a página para vê-la; suas alterações ficam guardadas nesta aba.", "err", true);
        }
        syncUi();
        return;
      }
      state = normalize(data[0].dados);
      loadedAt = data[0].atualizado_em;
      draft = null;
      clearStash();
      busy = false;
      statusLocked = false;
      closeEditor();
      renderContent(state);
      toast("Alterações publicadas.");
    } catch (_) {
      busy = false;
      setStatus("Não foi possível publicar. Verifique sua conexão e tente de novo; suas alterações continuam aqui.", "err", true);
      syncUi();
    }
  }

  // ---------- Eventos: login ----------
  document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => {
    const to = b.dataset.goto;
    if (to === "forgot") $("#forgot-email").value = $("#login-email").value;
    formMsg(to, "");
    showForm(to);
  }));

  $("#auth-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    if (!email || !password) { formMsg("login", "Preencha e-mail e senha.", "err"); return; }
    formBusy("login", true); formMsg("login", "Entrando...");
    let res;
    try { res = await sb.auth.signInWithPassword({ email, password }); }
    catch (err) { res = { error: err }; }
    formBusy("login", false);
    if (res.error || !res.data || !res.data.session) { formMsg("login", authErrorText(res.error), "err"); return; }
    $("#login-password").value = "";
    formMsg("login", "");
    enterPortal(res.data.session);
  });

  $("#auth-forgot").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#forgot-email").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { formMsg("forgot", "Informe um e-mail válido.", "err"); return; }
    formBusy("forgot", true); formMsg("forgot", "Enviando...");
    let res;
    try { res = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); }
    catch (err) { res = { error: err }; }
    formBusy("forgot", false);
    const err = res && res.error;
    if (err && (err.status === 429 || String(err.code || "").indexOf("rate_limit") >= 0)) { formMsg("forgot", authErrorText(err), "err"); return; }
    if (err && String(err.message || "").toLowerCase().indexOf("fetch") >= 0) { formMsg("forgot", authErrorText(err), "err"); return; }
    // Mesma resposta exista ou não o cadastro, para não revelar quem tem acesso.
    formMsg("forgot", "Se este e-mail tiver acesso ao portal, você vai receber um link em alguns minutos. Confira também a caixa de spam.", "ok");
  });

  $("#auth-newpass").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p1 = $("#newpass-1").value;
    const p2 = $("#newpass-2").value;
    if (p1.length < 8) { formMsg("newpass", "A senha precisa ter pelo menos 8 caracteres.", "err"); return; }
    if (!/[A-Za-z]/.test(p1) || !/\d/.test(p1)) { formMsg("newpass", "Misture letras e números na senha.", "err"); return; }
    if (p1 !== p2) { formMsg("newpass", "As duas senhas não são iguais.", "err"); return; }
    formBusy("newpass", true); formMsg("newpass", "Salvando...");
    let res;
    try { res = await sb.auth.updateUser({ password: p1 }); }
    catch (err) { res = { error: err }; }
    formBusy("newpass", false);
    if (res.error) { formMsg("newpass", authErrorText(res.error), "err"); return; }
    $("#newpass-1").value = ""; $("#newpass-2").value = "";
    if (newPassMode === "change" && state) { showView("portal"); toast("Senha alterada."); }
    else {
      const r = await sb.auth.getSession();
      if (r.data.session) { enterPortal(r.data.session); toast("Senha salva."); }
      else showForm("login");
    }
  });
  $("#newpass-cancel").addEventListener("click", () => { formMsg("newpass", ""); showView("portal"); });

  // ---------- Eventos: portal ----------
  $("#change-pass").addEventListener("click", () => openNewPass("change"));

  let signOutArmed = 0;
  $("#sign-out").addEventListener("click", async () => {
    const b = $("#sign-out");
    if (dirty() && !signOutArmed) {
      b.textContent = "Sair sem publicar?";
      signOutArmed = setTimeout(() => { signOutArmed = 0; b.textContent = "Sair"; }, 4000);
      return;
    }
    clearTimeout(signOutArmed); signOutArmed = 0; b.textContent = "Sair";
    resetPortal();
    showForm("login");
    try { await sb.auth.signOut(); } catch (_) {}
  });

  $("#conteudo").addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const reset = () => setTimeout(() => { b.textContent = "Copiar"; }, 1800);
    const fallback = () => {
      const el = b.parentElement.querySelector(".canal");
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      b.textContent = "Texto selecionado"; reset();
    };
    try { navigator.clipboard.writeText(b.dataset.copy).then(() => { b.textContent = "Copiado"; reset(); }, fallback); }
    catch (_) { fallback(); }
  });

  $("#ed-body").addEventListener("input", onField);
  $("#ed-body").addEventListener("change", onField);
  $("#ed-body").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || !draft) return;
    const s = SCHEMA.find((x) => x.key === edTab);
    const list = draft[s.key];
    const i = +b.dataset.idx;
    const act = b.dataset.act;
    let focusId = null;
    if (act === "add") {
      const it = Object.assign({ id: uid() }, s.blank());
      list.push(it);
      focusId = "ed-" + s.key + "-" + it.id + "-" + s.fields.find((f) => f.type !== "date" && f.type !== "select").k;
    } else if (act === "remove") list.splice(i, 1);
    else if (act === "up" && i > 0) list.splice(i - 1, 0, list.splice(i, 1)[0]);
    else if (act === "down" && i < list.length - 1) list.splice(i + 1, 0, list.splice(i, 1)[0]);
    statusLocked = false;
    renderEdBody();
    changed();
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); el.scrollIntoView({ block: "center" }); } }
  });
  $("#ed-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    edTab = b.dataset.tab; renderTabs(); renderEdBody();
  });
  $("#ed-close").addEventListener("click", closeEditor);
  $("#open-editor").addEventListener("click", openEditor);
  $("#banner-edit").addEventListener("click", openEditor);
  $("#ed-publish").addEventListener("click", publishDraft);
  let discardArmed = 0;
  $("#ed-discard").addEventListener("click", () => {
    const b = $("#ed-discard");
    if (!discardArmed) {
      b.textContent = "Confirmar descarte";
      b.classList.add("btn-danger");
      discardArmed = setTimeout(() => { discardArmed = 0; b.textContent = "Descartar alterações"; b.classList.remove("btn-danger"); }, 4000);
      return;
    }
    clearTimeout(discardArmed); discardArmed = 0;
    b.textContent = "Descartar alterações"; b.classList.remove("btn-danger");
    draft = clone(state); clearStash(); statusLocked = false;
    renderEdBody(); renderContent(state); syncUi();
    setStatus("Alterações descartadas.");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#editor").hidden) closeEditor();
  });

  // ---------- Início ----------
  async function boot() {
    if (!configured || !window.supabase || typeof window.supabase.createClient !== "function") { showForm("setup"); return; }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    sb.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") {
        if (session) { resetPortal(); showForm("login"); formMsg("login", "Sua sessão terminou. Entre de novo.", ""); }
      } else if (s) {
        session = s;
      }
    });
    let s = null;
    try { s = (await sb.auth.getSession()).data.session; } catch (_) {}
    if (hasAuthHash) history.replaceState(null, "", location.pathname + location.search);
    if (linkError) {
      showForm("login");
      formMsg("login", "O link usado expirou ou já foi aberto. Use “Esqueci minha senha” ou peça um novo convite à equipe Copplasa.", "err");
      return;
    }
    if (s && (linkType === "invite" || linkType === "recovery")) { session = s; openNewPass(linkType); return; }
    if (s) enterPortal(s);
    else showForm("login");
  }
  boot();
})();
