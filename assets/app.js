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
  let reports = [];
  let empresas = [];
  let people = [];
  let isEquipe = false;
  let relSetupMissing = false;
  let relEditing = null;
  let relBusy = false;
  let viewerToken = 0;
  const reportCache = new Map();

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
    await loadReports();
    const deep = /^#relatorio-([0-9a-f-]{36})$/i.exec(location.hash);
    if (deep) openReport(deep[1], false);
  }
  function resetPortal() {
    session = null; state = null; loadedAt = null; draft = null; canEdit = false; busy = false;
    reports = []; empresas = []; people = []; isEquipe = false; relEditing = null;
    reportCache.clear();
    clearStash();
    closeReport(true);
    hidePanels();
    $("#open-editor").hidden = true;
    $("#open-access").hidden = true;
    $("#banner").hidden = true;
    $("#relatorios").hidden = true;
    $("#nav-relatorios").hidden = true;
    $("#rel-list").innerHTML = "";
    $("#conteudo").innerHTML = "";
  }

  // ---------- Painéis laterais ----------
  const PANELS = ["editor", "rel-panel", "access-panel"];
  function showPanel(id) {
    PANELS.forEach((p) => { if (p !== id) $("#" + p).hidden = true; });
    $("#" + id).hidden = false;
    const wide = $("#" + id).classList.contains("editor-wide");
    $("#view-portal").classList.toggle("with-editor", !wide);
    $("#view-portal").classList.toggle("with-editor-wide", wide);
  }
  function hidePanels() {
    PANELS.forEach((p) => { $("#" + p).hidden = true; });
    $("#view-portal").classList.remove("with-editor", "with-editor-wide");
  }
  const anyPanelOpen = () => PANELS.some((p) => !$("#" + p).hidden);

  // ---------- Relatórios ----------
  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? mb.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB"
                   : Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR") + " KB";
  }
  async function loadReports() {
    let rel, eq;
    try {
      [rel, eq] = await Promise.all([
        sb.from("portal_relatorios")
          .select("id, titulo, descricao, empresa_id, arquivo, tamanho, publicado_em, empresa:portal_empresas(nome)")
          .order("publicado_em", { ascending: false }),
        sb.rpc("portal_eh_equipe")
      ]);
    } catch (_) {
      rel = { error: true }; eq = { error: true };
    }
    if (!session) return;
    relSetupMissing = !!rel.error;
    reports = rel.error ? [] : (rel.data || []);
    isEquipe = !eq.error && eq.data === true;
    if (canEdit && !relSetupMissing) {
      const emp = await sb.from("portal_empresas").select("id, nome").order("nome");
      empresas = emp.error ? [] : (emp.data || []);
    }
    renderReports();
  }
  function renderReports() {
    const show = reports.length > 0 || canEdit;
    $("#relatorios").hidden = !show;
    $("#nav-relatorios").hidden = !show;
    $("#rel-new").hidden = !(canEdit && !relSetupMissing);
    $("#open-access").hidden = !(canEdit && !relSetupMissing);
    if (!show) return;
    $("#rel-sub").textContent = isEquipe ? "Relatórios internos da equipe e relatórios de clientes." : "Relatórios da sua empresa.";
    if (relSetupMissing) {
      $("#rel-list").innerHTML = '<p class="rel-hint">A área de relatórios ainda não foi ativada no banco de dados. Rode o arquivo <code>supabase/relatorios.sql</code> no SQL Editor do Supabase e recarregue a página.</p>';
      return;
    }
    if (!reports.length) {
      $("#rel-list").innerHTML = '<p class="rel-hint">Nenhum relatório publicado ainda. Use “Publicar relatório” para enviar o primeiro.</p>';
      return;
    }
    $("#rel-list").innerHTML = '<div class="rel-grid">' + reports.map((r) => {
      const who = !isEquipe ? ""
        : r.empresa_id ? '<span><span class="chip">' + esc((r.empresa && r.empresa.nome) || "Cliente") + "</span></span>"
        : '<span><span class="chip chip-solid">Somente equipe</span></span>';
      const meta = "Atualizado em " + fmtTimestamp(r.publicado_em) + (r.tamanho ? " · " + fmtSize(r.tamanho) : "");
      return '<article class="rel-card"><h3>' + esc(r.titulo) + "</h3>" + who +
        (r.descricao ? "<p>" + esc(r.descricao) + "</p>" : "") +
        '<span class="rel-meta">' + esc(meta) + "</span>" +
        '<div class="rel-actions"><button type="button" class="btn btn-primary btn-sm" data-open="' + esc(r.id) + '">Abrir relatório</button>' +
        (canEdit ? '<button type="button" class="btn btn-ghost btn-sm" data-edit="' + esc(r.id) + '">Editar</button>' : "") +
        "</div></article>";
    }).join("") + "</div>";
  }

  // Troca o iframe inteiro em vez de navegar o existente: assim abrir um relatório
  // não cria entradas extras no histórico e o botão Voltar do navegador fecha o visualizador.
  function mountFrame(html) {
    const old = $("#viewer-frame");
    const f = document.createElement("iframe");
    f.id = "viewer-frame";
    f.title = "Relatório";
    f.setAttribute("sandbox", "allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals");
    f.setAttribute("referrerpolicy", "no-referrer");
    if (html == null) f.hidden = true;
    else f.srcdoc = html;
    old.replaceWith(f);
    return f;
  }
  function setViewerStatus(msg, kind) {
    const el = $("#viewer-status");
    el.textContent = msg || "";
    el.hidden = !msg;
    el.className = "viewer-status" + (kind ? " " + kind : "");
  }
  async function openReport(id, push) {
    const r = reports.find((x) => x.id === id);
    if (!r) {
      if (!push) history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    const token = ++viewerToken;
    $("#viewer-title").textContent = r.titulo;
    $("#viewer-meta").textContent = "Atualizado em " + fmtTimestamp(r.publicado_em);
    mountFrame(null);
    setViewerStatus("Carregando relatório" + (r.tamanho ? " (" + fmtSize(r.tamanho) + ")" : "") + "...");
    $("#viewer").hidden = false;
    document.body.classList.add("viewer-open");
    if (push !== false) history.pushState({ relatorio: id }, "", "#relatorio-" + id);
    $("#viewer-back").focus();
    try {
      let html = reportCache.get(r.arquivo);
      if (!html) {
        const { data, error } = await sb.storage.from("relatorios").download(r.arquivo);
        if (error) throw error;
        html = await data.text();
        reportCache.set(r.arquivo, html);
      }
      if (token !== viewerToken) return;
      // O relatório roda isolado (sem acesso à sessão do portal), mas com scripts e downloads.
      mountFrame(html);
      setViewerStatus("");
    } catch (_) {
      if (token !== viewerToken) return;
      setViewerStatus("Não foi possível abrir o relatório. Verifique sua conexão e tente de novo.", "err");
    }
  }
  function closeReport(fromHistory) {
    if ($("#viewer").hidden) return;
    viewerToken++;
    $("#viewer").hidden = true;
    document.body.classList.remove("viewer-open");
    mountFrame(null);
    if (!fromHistory) {
      if (history.state && history.state.relatorio) history.back();
      else if (/^#relatorio-/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
    }
  }

  // Publicar / editar
  function relStatus(msg, kind) {
    const el = $("#rel-status");
    el.textContent = msg || "";
    el.className = "ed-status" + (kind ? " " + kind : "");
  }
  function setRelBusy(on) {
    ["#rel-save", "#rel-cancel", "#rel-delete", "#rel-titulo", "#rel-descricao", "#rel-empresa", "#rel-arquivo"].forEach((s) => { $(s).disabled = on; });
  }
  let relDeleteArmed = 0;
  function disarmRelDelete() {
    clearTimeout(relDeleteArmed); relDeleteArmed = 0;
    $("#rel-delete").textContent = "Excluir relatório";
    $("#rel-delete").classList.remove("btn-danger");
  }
  function openRelPanel(r) {
    if (!canEdit || relSetupMissing) return;
    relEditing = r || null;
    $("#rel-title").textContent = r ? "Editar relatório" : "Publicar relatório";
    $("#rel-save").textContent = r ? "Salvar" : "Publicar";
    $("#rel-titulo").value = r ? r.titulo : "";
    $("#rel-descricao").value = r ? (r.descricao || "") : "";
    $("#rel-empresa").innerHTML = '<option value="">Somente equipe Copplasa (interno)</option>' +
      empresas.map((e) => '<option value="' + esc(e.id) + '">Cliente: ' + esc(e.nome) + "</option>").join("");
    $("#rel-empresa").value = r && r.empresa_id ? r.empresa_id : "";
    $("#rel-empresa-hint").textContent = empresas.length
      ? "Clientes só veem relatórios da própria empresa. A equipe vê todos."
      : "Para publicar para um cliente, cadastre a empresa em Acessos.";
    $("#rel-arquivo").value = "";
    $("#rel-arquivo-label").textContent = r ? "Substituir arquivo (opcional)" : "Arquivo do relatório (.html)";
    $("#rel-arquivo-hint").textContent = r
      ? "Envie a versão nova do relatório para atualizar o que todos veem. Até 50 MB."
      : "O mesmo arquivo que abre no navegador com dois cliques. Até 50 MB.";
    $("#rel-delete-zone").hidden = !r;
    disarmRelDelete();
    relStatus("");
    setRelBusy(false);
    showPanel("rel-panel");
    $("#rel-title").focus();
  }
  function closeRelPanel() {
    if (relBusy) return;
    $("#rel-panel").hidden = true;
    if (!anyPanelOpen()) hidePanels();
    relEditing = null;
  }
  function newFileName() {
    const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
    return id + ".html";
  }
  function relErrorText(e) {
    const msg = String((e && e.message) || "").toLowerCase();
    const status = String((e && (e.statusCode || e.status)) || "");
    if (status === "413" || msg.indexOf("maximum allowed size") >= 0 || msg.indexOf("too large") >= 0) return "O arquivo passa do limite de 50 MB.";
    if (msg.indexOf("mime type") >= 0) return "O arquivo precisa ser uma página .html.";
    if ((e && e.code) === "sem_permissao" || (e && e.code) === "42501" || msg.indexOf("row-level security") >= 0 || status === "403") return "Seu acesso não permite publicar relatórios.";
    if (msg.indexOf("fetch") >= 0 || msg.indexOf("network") >= 0) return "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
    return "Não foi possível salvar o relatório. Tente de novo em instantes.";
  }
  async function saveReport() {
    if (relBusy) return;
    const titulo = $("#rel-titulo").value.trim();
    const descricao = $("#rel-descricao").value.trim();
    const empresaId = $("#rel-empresa").value || null;
    const file = $("#rel-arquivo").files[0] || null;
    if (!titulo) { relStatus("Dê um título ao relatório.", "err"); $("#rel-titulo").focus(); return; }
    if (!relEditing && !file) { relStatus("Escolha o arquivo .html do relatório.", "err"); $("#rel-arquivo").focus(); return; }
    if (file) {
      if (!/\.html?$/i.test(file.name)) { relStatus("O arquivo precisa ser uma página .html.", "err"); return; }
      if (file.size > 50 * 1024 * 1024) { relStatus("O arquivo passa do limite de 50 MB.", "err"); return; }
      const head = (await file.slice(0, 4096).text()).toLowerCase();
      if (head.indexOf("<html") < 0 && head.indexOf("<!doctype") < 0) { relStatus("Este arquivo não parece ser uma página HTML.", "err"); return; }
    }
    const editing = relEditing;
    relBusy = true; setRelBusy(true);
    let newPath = null;
    try {
      if (file) {
        relStatus("Enviando arquivo (" + fmtSize(file.size) + ")...");
        newPath = newFileName();
        const up = await sb.storage.from("relatorios").upload(newPath, file, { contentType: "text/html", upsert: false, cacheControl: "3600" });
        if (up.error) throw up.error;
      }
      relStatus("Salvando...");
      const fields = { titulo, descricao, empresa_id: empresaId };
      if (newPath) { fields.arquivo = newPath; fields.tamanho = file.size; }
      const res = editing
        ? await sb.from("portal_relatorios").update(fields).eq("id", editing.id).select("id")
        : await sb.from("portal_relatorios").insert(fields).select("id");
      if (res.error) throw res.error;
      if (!res.data || !res.data.length) throw { code: "sem_permissao" };
      if (editing && newPath && editing.arquivo) {
        reportCache.delete(editing.arquivo);
        try { await sb.storage.from("relatorios").remove([editing.arquivo]); } catch (_) {}
      }
      newPath = null;
      relBusy = false;
      closeRelPanel();
      toast(editing ? "Relatório atualizado." : "Relatório publicado.");
      await loadReports();
    } catch (e) {
      if (newPath) { try { await sb.storage.from("relatorios").remove([newPath]); } catch (_) {} }
      relStatus(relErrorText(e), "err");
    } finally {
      relBusy = false;
      setRelBusy(false);
    }
  }
  async function deleteReport() {
    const r = relEditing;
    if (!r || relBusy) return;
    const b = $("#rel-delete");
    if (!relDeleteArmed) {
      b.textContent = "Confirmar exclusão";
      b.classList.add("btn-danger");
      relDeleteArmed = setTimeout(disarmRelDelete, 4000);
      return;
    }
    disarmRelDelete();
    relBusy = true; setRelBusy(true); relStatus("Excluindo...");
    try {
      const res = await sb.from("portal_relatorios").delete().eq("id", r.id).select("id");
      if (res.error) throw res.error;
      if (!res.data || !res.data.length) throw { code: "sem_permissao" };
      reportCache.delete(r.arquivo);
      try { await sb.storage.from("relatorios").remove([r.arquivo]); } catch (_) {}
      relBusy = false;
      closeRelPanel();
      toast("Relatório excluído.");
      await loadReports();
    } catch (e) {
      relStatus(relErrorText(e), "err");
    } finally {
      relBusy = false;
      setRelBusy(false);
    }
  }

  // Acessos
  function accessStatus(msg, kind) {
    const el = $("#access-status");
    el.textContent = msg || "";
    el.className = "ed-status" + (kind ? " " + kind : "");
  }
  async function openAccessPanel() {
    if (!canEdit || relSetupMissing) return;
    showPanel("access-panel");
    $("#access-title").focus();
    $("#access-list").innerHTML = "";
    accessStatus("Carregando...");
    await loadAccess();
  }
  async function loadAccess() {
    let acc, emp;
    try {
      [acc, emp] = await Promise.all([
        sb.rpc("portal_listar_acessos"),
        sb.from("portal_empresas").select("id, nome").order("nome")
      ]);
    } catch (_) {
      acc = { error: true };
    }
    if (acc.error || !emp || emp.error) { accessStatus("Não foi possível carregar os acessos. Recarregue a página e tente de novo.", "err"); return; }
    people = acc.data || [];
    empresas = emp.data || [];
    renderAccess();
    accessStatus(people.length === 1 ? "1 login cadastrado." : people.length + " logins cadastrados.");
  }
  function accessValue(p) {
    if (p.editor) return "editor";
    if (p.equipe) return "equipe";
    return p.empresa_id ? "empresa:" + p.empresa_id : "";
  }
  function renderAccess() {
    const opts = '<option value="">Só o portal (sem relatórios)</option><option value="equipe">Equipe Copplasa</option>' +
      empresas.map((e) => '<option value="empresa:' + esc(e.id) + '">Cliente: ' + esc(e.nome) + "</option>").join("");
    $("#access-list").innerHTML = people.map((p) => {
      const last = p.ultimo_acesso ? "Último acesso: " + fmtTimestamp(p.ultimo_acesso) : "Ainda não entrou";
      const sel = p.editor
        ? '<select disabled aria-label="Acesso de ' + esc(p.email) + '"><option value="editor">Editor (equipe)</option></select>'
        : '<select data-user="' + esc(p.user_id) + '" aria-label="Acesso de ' + esc(p.email) + '">' + opts + "</select>";
      return '<div class="access-row"><div class="access-who"><span class="access-email">' + esc(p.email) + '</span><span class="access-last">' + esc(last) + "</span></div>" + sel + "</div>";
    }).join("");
    $("#access-list").querySelectorAll("select[data-user]").forEach((s) => {
      const p = people.find((x) => x.user_id === s.dataset.user);
      s.value = accessValue(p);
    });
  }
  async function changeAccess(sel) {
    const p = people.find((x) => x.user_id === sel.dataset.user);
    if (!p) return;
    const v = sel.value;
    const before = accessValue(p);
    sel.disabled = true;
    accessStatus("Salvando...");
    let res;
    try {
      res = await sb.rpc("portal_definir_acesso", {
        p_user_id: p.user_id,
        p_equipe: v === "equipe",
        p_empresa_id: v.indexOf("empresa:") === 0 ? v.slice(8) : null
      });
    } catch (e) { res = { error: e }; }
    sel.disabled = false;
    if (res.error) {
      sel.value = before;
      accessStatus("Não foi possível alterar o acesso de " + p.email + ". Tente de novo.", "err");
      return;
    }
    p.equipe = v === "equipe";
    p.empresa_id = v.indexOf("empresa:") === 0 ? v.slice(8) : null;
    accessStatus("Acesso de " + p.email + " atualizado.", "ok");
  }
  async function addEmpresa() {
    const input = $("#new-empresa");
    const nome = input.value.trim();
    if (!nome) { accessStatus("Digite o nome da empresa.", "err"); input.focus(); return; }
    $("#add-empresa").disabled = true;
    let res;
    try { res = await sb.from("portal_empresas").insert({ nome }).select("id"); }
    catch (e) { res = { error: e }; }
    $("#add-empresa").disabled = false;
    if (res.error) {
      accessStatus(res.error.code === "23505" ? "Essa empresa já está cadastrada." : "Não foi possível cadastrar a empresa. Tente de novo.", "err");
      return;
    }
    input.value = "";
    await loadAccess();
    accessStatus("Empresa “" + nome + "” cadastrada. Agora escolha quem é dessa empresa.", "ok");
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
    showPanel("editor");
    renderTabs(); renderEdBody(); syncUi();
    $("#ed-title").focus();
  }
  function closeEditor() {
    $("#editor").hidden = true;
    if (!anyPanelOpen()) hidePanels();
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
  // ---------- Eventos: relatórios e acessos ----------
  $("#rel-new").addEventListener("click", () => openRelPanel(null));
  $("#rel-list").addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) { openReport(o.dataset.open, true); return; }
    const ed = e.target.closest("[data-edit]");
    if (ed) openRelPanel(reports.find((r) => r.id === ed.dataset.edit));
  });
  $("#rel-form").addEventListener("submit", (e) => { e.preventDefault(); saveReport(); });
  $("#rel-save").addEventListener("click", saveReport);
  $("#rel-close").addEventListener("click", closeRelPanel);
  $("#rel-cancel").addEventListener("click", closeRelPanel);
  $("#rel-delete").addEventListener("click", deleteReport);

  $("#open-access").addEventListener("click", openAccessPanel);
  $("#access-close").addEventListener("click", () => { $("#access-panel").hidden = true; if (!anyPanelOpen()) hidePanels(); loadReports(); });
  $("#access-list").addEventListener("change", (e) => { if (e.target.matches("select[data-user]")) changeAccess(e.target); });
  $("#add-empresa").addEventListener("click", addEmpresa);
  $("#new-empresa").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addEmpresa(); } });

  $("#viewer-back").addEventListener("click", () => closeReport(false));
  window.addEventListener("popstate", (e) => {
    if (e.state && e.state.relatorio && session) openReport(e.state.relatorio, false);
    else closeReport(true);
  });
  // Link de relatório colado com o portal já aberto
  window.addEventListener("hashchange", () => {
    const m = /^#relatorio-([0-9a-f-]{36})$/i.exec(location.hash);
    if (m && session && state && $("#viewer").hidden) openReport(m[1], false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#viewer").hidden) closeReport(false);
    else if (!$("#editor").hidden) closeEditor();
    else if (!$("#rel-panel").hidden) closeRelPanel();
    else if (!$("#access-panel").hidden) $("#access-close").click();
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
