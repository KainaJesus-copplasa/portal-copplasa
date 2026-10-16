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

  const SCHEMA = [
    { key: "portal", label: "Boas-vindas", single: true, fields: [
      { k: "boasVindas", label: "Texto de boas-vindas", type: "textarea" }] },
    { key: "avisos", label: "Avisos", noun: "aviso", req: "titulo", fields: [
      { k: "data", label: "Data", type: "date" },
      { k: "titulo", label: "Título", type: "text" },
      { k: "texto", label: "Texto", type: "textarea" },
      { k: "exemplo", label: "Marcar como exemplo", type: "check" }],
      blank: () => ({ data: todayISO(), titulo: "", texto: "", exemplo: false }) },
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
  function fmtDateTime(ts) {
    const d = ts ? new Date(ts) : null;
    return d && !isNaN(d) ? d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
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

  // ---------- Marca: padrões do site copplasa.com.br ----------
  const BRAND_CACHE_KEY = "copplasa-portal-marca";
  const FONT_SPEC = {
    "EB Garamond": "wght@400;500;600;700",
    "Playfair Display": "wght@400;500;600;700",
    "Lora": "wght@400;500;600;700",
    "Merriweather": "wght@300;400;700",
    "Source Serif 4": "wght@300;400;600;700",
    "Libre Baskerville": "wght@400;700",
    "Montserrat": "wght@300;400;500;600;700",
    "Poppins": "wght@300;400;500;600;700",
    "Lato": "ital,wght@0,300;0,400;0,700;1,300;1,400",
    "Raleway": "wght@300;400;500;600;700",
    "Work Sans": "wght@300;400;500;600;700",
    "Nunito": "wght@300;400;600;700",
    "Open Sans": "wght@300;400;600;700",
    "Roboto": "wght@300;400;500;700",
    "Inter": "wght@300;400;500;600;700",
    "Source Sans 3": "wght@300;400;600;700"
  };
  const SERIF_FONTS = ["EB Garamond", "Playfair Display", "Lora", "Merriweather", "Source Serif 4", "Libre Baskerville"];
  const FONTS_TITULOS = ["EB Garamond", "Playfair Display", "Lora", "Merriweather", "Source Serif 4", "Libre Baskerville", "Montserrat", "Poppins", "Lato", "Raleway", "Work Sans", "Nunito"];
  const FONTS_TEXTO = ["Lato", "Open Sans", "Roboto", "Inter", "Nunito", "Source Sans 3", "Montserrat", "Poppins", "Work Sans", "Raleway", "Merriweather"];
  const FORMATOS = {
    pilula: { nome: "Arredondado", btn: "999px", card: "16px", field: "10px" },
    suave: { nome: "Cantos suaves", btn: "8px", card: "10px", field: "6px" },
    reto: { nome: "Cantos retos", btn: "2px", card: "2px", field: "2px" }
  };
  const COLOR_KEYS = [
    { k: "principal", nome: "Principal", uso: "Botões, links, títulos de cartões e tela de login" },
    { k: "secundaria", nome: "Secundária", uso: "Marcadores e detalhes" },
    { k: "destaque", nome: "Destaque", uso: "Botão Sair, avisos de prévia e foco do teclado" },
    { k: "texto", nome: "Texto", uso: "Textos e títulos" },
    { k: "fundo", nome: "Fundo", uso: "Fundo da página" },
    { k: "fundoSuave", nome: "Fundo suave", uso: "Topo e faixas alternadas" },
    { k: "rodape", nome: "Rodapé", uso: "Fundo do rodapé" }
  ];
  const DEFAULT_BRAND = {
    nome: "Copplasa",
    portalNome: "Portal Copplasa",
    slogan: "seu par em seguros e benefícios",
    loginTexto: "Comunicados, relatórios e canais de atendimento para clientes, parceiros e equipe Copplasa.",
    logo: "assets/marca/logo.svg",
    logoClaro: "assets/marca/logo-branco.svg",
    icone: "assets/marca/icone.png",
    cores: { principal: "#006CD1", secundaria: "#00D1CE", destaque: "#D1006C", texto: "#4D4D4D", fundo: "#FFFFFF", fundoSuave: "#E6F0FA", rodape: "#4D4D4D" },
    fontes: { titulos: "EB Garamond", texto: "Lato" },
    titulosMinusculos: true,
    formato: "pilula",
    empresa: {
      descricao: "Mais do que uma consultoria: uma parceira estratégica em benefícios e seguros, cuidando do que realmente importa: as pessoas.",
      email: "contato@copplasa.com.br",
      telefone: "",
      whatsapp: "",
      site: "https://www.copplasa.com.br",
      redes: {
        instagram: "https://www.instagram.com/copplasa/",
        linkedin: "https://br.linkedin.com/company/copplasa",
        facebook: "https://www.facebook.com/copplasa/",
        youtube: "https://www.youtube.com/@copplasa"
      },
      unidades: [
        { nome: "Unidade São Paulo", endereco: "Rua Alexandre Dumas, 2220 - Conjuntos 51 e 53 - Chácara Santo Antônio (Zona Sul), São Paulo - SP, 04717-004", mapa: "https://maps.app.goo.gl/gR5A5AQe4zubAVjv8" },
        { nome: "Unidade Rio de Janeiro", endereco: "R. da Alfândega, 101 - Sala 901 - Centro, Rio de Janeiro - RJ, 20070-003", mapa: "https://maps.app.goo.gl/XmuUK1FPQE99Eh4A6" }
      ],
      links: [
        { titulo: "Site da Copplasa", url: "https://www.copplasa.com.br" },
        { titulo: "Blog", url: "https://blog.copplasa.com.br" },
        { titulo: "Privacidade", url: "https://copplasa.com.br/politica-de-privacidade.html" },
        { titulo: "Tratamento de dados", url: "https://copplasa.com.br/AVISO%20DE%20TRATAMENTO%20DE%20DADOS.html" },
        { titulo: "Termos de serviço", url: "https://copplasa.com.br/termos-servico.html" }
      ]
    }
  };
  const SOCIAL = {
    instagram: { nome: "Instagram", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>' },
    linkedin: { nome: "LinkedIn", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor"/><g fill="var(--footer-bg)"><rect x="6.6" y="10" width="2.4" height="7.4"/><circle cx="7.8" cy="7.3" r="1.4"/><path d="M11 10h2.3v1.1c.4-.7 1.3-1.3 2.6-1.3 2.3 0 2.8 1.5 2.8 3.4v4.2h-2.4v-3.7c0-.9-.1-2-1.3-2s-1.6.9-1.6 1.9v3.8H11z"/></g></svg>' },
    facebook: { nome: "Facebook", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="currentColor"/><path fill="var(--footer-bg)" d="M13.2 21.4v-6.9h2.3l.4-2.7h-2.7v-1.7c0-.8.3-1.3 1.4-1.3h1.4V6.4c-.3 0-1.1-.1-2-.1-2 0-3.3 1.2-3.3 3.4v2.1H8.4v2.7h2.3v6.9z"/></svg>' },
    youtube: { nome: "YouTube", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5.5" width="20" height="13" rx="4" fill="currentColor"/><path fill="var(--footer-bg)" d="M10 9v6l5.2-3z"/></svg>' }
  };

  const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ""));
  function safeImg(u) {
    u = String(u || "");
    return /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(u) || /^assets\/marca\/[\w.-]+$/.test(u) || /^https:\/\/\S+$/i.test(u) ? u : "";
  }
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  const onColor = (hex) => (contrast(hex, "#FFFFFF") >= contrast(hex, "#1A1A1A") ? "#FFFFFF" : "#1A1A1A");
  function deepMerge(base, over) {
    const out = clone(base);
    if (!over || typeof over !== "object" || Array.isArray(over)) return out;
    Object.keys(base).forEach((k) => {
      const v = over[k];
      if (v === undefined || v === null) return;
      if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) out[k] = deepMerge(base[k], v);
      else if (Array.isArray(base[k])) out[k] = Array.isArray(v) ? clone(v) : out[k];
      else if (typeof v === typeof base[k]) out[k] = v;
    });
    return out;
  }
  function cleanBrand(raw) {
    const b = deepMerge(DEFAULT_BRAND, raw);
    COLOR_KEYS.forEach(({ k }) => { if (!isHex(b.cores[k])) b.cores[k] = DEFAULT_BRAND.cores[k]; });
    if (FONTS_TITULOS.indexOf(b.fontes.titulos) < 0) b.fontes.titulos = DEFAULT_BRAND.fontes.titulos;
    if (FONTS_TEXTO.indexOf(b.fontes.texto) < 0) b.fontes.texto = DEFAULT_BRAND.fontes.texto;
    if (!FORMATOS[b.formato]) b.formato = DEFAULT_BRAND.formato;
    ["logo", "logoClaro", "icone"].forEach((k) => { if (!safeImg(b[k])) b[k] = DEFAULT_BRAND[k]; });
    b.empresa.unidades = b.empresa.unidades.filter((u) => u && typeof u === "object");
    b.empresa.links = b.empresa.links.filter((l) => l && typeof l === "object");
    return b;
  }
  function fontHref(titulos, texto) {
    const fam = (n) => "family=" + n.replace(/ /g, "+") + ":" + FONT_SPEC[n];
    const fams = titulos === texto ? [fam(titulos)] : [fam(titulos), fam(texto)];
    return "https://fonts.googleapis.com/css2?" + fams.join("&") + "&display=swap";
  }
  function applyBrand(raw) {
    const b = cleanBrand(raw);
    const st = document.documentElement.style;
    const c = b.cores;
    st.setProperty("--c-principal", c.principal);
    st.setProperty("--c-secundaria", c.secundaria);
    st.setProperty("--c-destaque", c.destaque);
    st.setProperty("--c-texto", c.texto);
    st.setProperty("--c-fundo", c.fundo);
    st.setProperty("--c-suave", c.fundoSuave);
    st.setProperty("--c-rodape", c.rodape);
    st.setProperty("--c-sobre-principal", onColor(c.principal));
    st.setProperty("--c-sobre-rodape", onColor(c.rodape));
    st.setProperty("--font-display", '"' + b.fontes.titulos + '", ' + (SERIF_FONTS.indexOf(b.fontes.titulos) >= 0 ? 'Georgia, "Times New Roman", serif' : '"Segoe UI", system-ui, sans-serif'));
    st.setProperty("--font-body", '"' + b.fontes.texto + '", "Segoe UI", system-ui, -apple-system, sans-serif');
    const f = FORMATOS[b.formato];
    st.setProperty("--radius-btn", f.btn);
    st.setProperty("--radius-card", f.card);
    st.setProperty("--radius-field", f.field);
    st.setProperty("--title-transform", b.titulosMinusculos ? "lowercase" : "none");
    const href = fontHref(b.fontes.titulos, b.fontes.texto);
    const link = $("#brand-fonts");
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    document.querySelectorAll('[data-logo="cor"]').forEach((img) => { img.src = b.logo; img.alt = b.nome; });
    document.querySelectorAll('[data-logo="claro"]').forEach((img) => { img.src = b.logoClaro; img.alt = b.nome; });
    $("#brand-icon").setAttribute("href", b.icone);
    document.querySelectorAll("[data-brand]").forEach((el) => { el.textContent = b[el.dataset.brand] || ""; });
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute("content", c.principal);
    document.title = b.portalNome || b.nome;
    renderFooter(b);
  }
  function renderFooter(b) {
    const e = b.empresa;
    const ext = (u, label) => '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
    const socials = Object.keys(SOCIAL).map((k) => {
      const u = safeUrl(e.redes && e.redes[k]);
      return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" aria-label="' + SOCIAL[k].nome + '">' + SOCIAL[k].svg + "</a>" : "";
    }).join("");
    const units = e.unidades.filter((u) => u.nome || u.endereco).map((u) => {
      const m = safeUrl(u.mapa);
      return '<p class="foot-unit"><strong>' + esc(u.nome) + "</strong>" + (m ? ext(m, esc(u.endereco)) : esc(u.endereco)) + "</p>";
    }).join("");
    const contacts = [];
    if (/^\S+@\S+\.\S+$/.test(e.email || "")) contacts.push('<li><a href="mailto:' + esc(e.email) + '">' + esc(e.email) + "</a></li>");
    const tel = String(e.telefone || "").replace(/\D/g, "");
    if (tel.length >= 8) contacts.push('<li><a href="tel:+' + (tel.length <= 11 ? "55" + tel : tel) + '">' + esc(e.telefone) + "</a></li>");
    const wa = String(e.whatsapp || "").replace(/\D/g, "");
    if (wa.length >= 10) contacts.push("<li>" + ext("https://wa.me/" + (wa.length <= 11 ? "55" + wa : wa), "WhatsApp " + esc(e.whatsapp)) + "</li>");
    const site = safeUrl(e.site);
    if (site) contacts.push("<li>" + ext(site, esc(hostOf(site))) + "</li>");
    const links = e.links.map((l) => { const u = safeUrl(l.url); return u && l.titulo ? "<li>" + ext(u, esc(l.titulo)) + "</li>" : ""; }).join("");
    $("#site-footer").innerHTML = '<div class="wrap foot-grid">' +
      '<div><img class="foot-logo" src="' + esc(b.logoClaro) + '" alt="' + esc(b.nome) + '">' +
        (e.descricao ? '<p class="foot-desc">' + esc(e.descricao) + "</p>" : "") +
        (socials ? '<div class="socials">' + socials + "</div>" : "") + "</div>" +
      (units ? "<div><h4>Unidades</h4>" + units + "</div>" : "") +
      (contacts.length ? "<div><h4>Contato</h4><ul>" + contacts.join("") + "</ul></div>" : "") +
      (links ? "<div><h4>Links</h4><ul>" + links + "</ul></div>" : "") +
      '</div><div class="wrap foot-bottom"><p>© ' + new Date().getFullYear() + " " + esc(b.nome) + " | todos os direitos reservados</p>" +
      "<p>Acesso restrito a pessoas cadastradas. Não envie CPF, dados de saúde, apólices ou sinistros por este portal.</p></div>";
  }
  function readBrandCache() { try { const s = localStorage.getItem(BRAND_CACHE_KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; } }
  function writeBrandCache(d) { try { localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(d || {})); } catch (_) {} }

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
  let multiGroups = true; // false enquanto o banco ainda não tem a tabela de grupos por relatório
  let linkSupport = true; // false enquanto o banco ainda não aceita relatório por link
  let autoSupport = true; // false enquanto o banco ainda não aceita cópia automática
  let relEditing = null;
  let relBusy = false;
  let viewerToken = 0;
  const reportCache = new Map();
  let brand = cleanBrand(readBrandCache() || {});
  let brandLoadedAt = null;
  let brandSetupMissing = false;
  let brandDraft = null;
  let brandTab = "marca";
  let brandBusy = false;
  let brandStatusLocked = false;

  // ---------- Telas ----------
  function showView(name) {
    ["loading", "auth", "portal"].forEach((v) => { $("#view-" + v).hidden = v !== name; });
    $("#site-footer").hidden = name === "loading";
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
  function band(id, soft, inner) {
    return '<section class="band' + (soft ? " band-soft" : "") + '" id="' + id + '" aria-labelledby="h-' + id + '"><div class="wrap">' + inner + "</div></section>";
  }
  function secAvisos(d) {
    const items = d.avisos.slice().sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    const body = items.length
      ? '<div class="avisos">' + items.map((a) =>
          '<article class="aviso"><div class="aviso-date">' + esc(fmtDate(a.data)) + '</div><div class="aviso-body"><h3>' +
          "<span>" + esc(a.titulo) + "</span>" + (a.exemplo ? EX : "") + "</h3>" + paras(a.texto) + "</div></article>").join("") + "</div>"
      : '<p class="empty">Nenhum aviso publicado no momento.</p>';
    return band("avisos", false, head("avisos", "Avisos", "Comunicados para clientes, parceiros e equipe.") + body);
  }
  function secContatos(d) {
    const body = d.contatos.length
      ? '<div class="contacts">' + d.contatos.map((c) =>
          '<article class="contact"><h3><span>' + esc(c.area) + "</span>" + (c.exemplo ? EX : "") + "</h3>" +
          (c.canal ? '<div class="canal-row"><span class="canal">' + esc(c.canal) + "</span>" +
            (c.exemplo ? "" : '<button type="button" class="btn btn-ghost btn-sm" data-copy="' + esc(c.canal) + '">Copiar</button>') + "</div>" : "") +
          (c.horario ? '<p class="horario">' + esc(c.horario) + "</p>" : "") + "</article>").join("") + "</div>"
      : '<p class="empty">Nenhum contato cadastrado.</p>';
    return band("contatos", true, head("contatos", "Contatos", "Fale com a Copplasa.") + body);
  }
  function renderContent(d) {
    $("#lede").textContent = d.portal.boasVindas || "";
    $("#stamp-date").textContent = fmtTimestamp(loadedAt) || "data não informada";
    $("#conteudo").innerHTML = secAvisos(d) + secContatos(d);
  }

  // ---------- Entrar no portal ----------
  async function enterPortal(s) {
    session = s;
    $("#who-name").textContent = (s.user && s.user.email) || "";
    showView("portal");
    $("#lede").textContent = "";
    $("#stamp-date").textContent = "...";
    $("#conteudo").innerHTML = '<div class="band"><div class="wrap"><p class="empty">Carregando conteúdo...</p></div></div>';
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
      $("#conteudo").innerHTML = '<div class="band"><div class="wrap"><p class="load-err">Não foi possível carregar o conteúdo. Recarregue a página. Se o problema continuar, fale com a equipe Copplasa.</p></div></div>';
      return;
    }
    state = normalize(content.data ? content.data.dados : {});
    loadedAt = content.data ? content.data.atualizado_em : null;
    canEdit = !!(editor && !editor.error && editor.data);
    $("#open-editor").hidden = !canEdit;
    $("#open-brand").hidden = !canEdit;
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
    if (brandDraft) { brandDraft = null; applyBrand(brand); }
    $("#open-editor").hidden = true;
    $("#open-brand").hidden = true;
    $("#open-access").hidden = true;
    $("#banner").hidden = true;
    $("#relatorios").hidden = true;
    $("#nav-relatorios").hidden = true;
    $("#rel-list").innerHTML = "";
    $("#conteudo").innerHTML = "";
  }

  // ---------- Painéis laterais ----------
  const PANELS = ["editor", "brand-panel", "rel-panel", "access-panel"];
  function showPanel(id) {
    // Não troca de painel com uma aparência não publicada: ela se perderia sem aviso.
    if (id !== "brand-panel" && brandDirty() && !$("#brand-panel").hidden) {
      brandStatus("Publique ou descarte as mudanças de aparência antes de abrir outro painel.", "err", true);
      return false;
    }
    if (id !== "brand-panel" && brandDraft) { brandDraft = null; applyBrand(brand); }
    PANELS.forEach((p) => { if (p !== id) $("#" + p).hidden = true; });
    $("#" + id).hidden = false;
    const wide = $("#" + id).classList.contains("editor-wide");
    $("#view-portal").classList.toggle("with-editor", !wide);
    $("#view-portal").classList.toggle("with-editor-wide", wide);
    return true;
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
  const REL_FIELDS = "id, titulo, descricao, empresa_id, arquivo, tamanho, publicado_em";
  async function loadReports() {
    let rel, eq;
    // Do banco mais novo para o mais antigo: link + vários grupos, só vários grupos, modelo original.
    const tentativas = [
      { campos: REL_FIELDS + ", url, fonte_url, grupos:portal_relatorio_grupos(empresa_id)", grupos: true, link: true, auto: true },
      { campos: REL_FIELDS + ", url, grupos:portal_relatorio_grupos(empresa_id)", grupos: true, link: true, auto: false },
      { campos: REL_FIELDS + ", grupos:portal_relatorio_grupos(empresa_id)", grupos: true, link: false, auto: false },
      { campos: REL_FIELDS, grupos: false, link: false, auto: false }
    ];
    try {
      eq = sb.rpc("portal_eh_equipe");
      for (const t of tentativas) {
        rel = await sb.from("portal_relatorios").select(t.campos).order("publicado_em", { ascending: false });
        multiGroups = t.grupos;
        linkSupport = t.link;
        autoSupport = t.auto;
        if (!rel.error) break;
      }
      eq = await eq;
    } catch (_) {
      rel = { error: true }; eq = { error: true };
    }
    if (!session) return;
    relSetupMissing = !!rel.error;
    reports = (rel.error ? [] : (rel.data || [])).map((r) => Object.assign(r, {
      grupoIds: multiGroups ? (r.grupos || []).map((g) => g.empresa_id) : (r.empresa_id ? [r.empresa_id] : [])
    }));
    isEquipe = !eq.error && eq.data === true;
    if ((canEdit || isEquipe) && !relSetupMissing) {
      const emp = await sb.from("portal_empresas").select("id, nome").order("nome");
      empresas = emp.error ? [] : (emp.data || []);
    }
    renderReports();
  }
  const groupName = (id) => (empresas.find((e) => e.id === id) || {}).nome || "Grupo";
  function renderReports() {
    const show = reports.length > 0 || canEdit;
    $("#relatorios").hidden = !show;
    $("#nav-relatorios").hidden = !show;
    $("#rel-new").hidden = !(canEdit && !relSetupMissing);
    $("#open-access").hidden = !(canEdit && !relSetupMissing);
    if (!show) return;
    $("#rel-sub").textContent = isEquipe ? "Relatórios internos da equipe e relatórios liberados para grupos." : "Relatórios liberados para você.";
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
        : r.grupoIds.length ? '<span class="chips">' + r.grupoIds.map((id) => '<span class="chip">' + esc(groupName(id)) + "</span>").join("") + "</span>"
        : '<span><span class="chip chip-solid">Somente equipe</span></span>';
      const link = safeUrl(r.url);
      const meta = r.fonte_url
        ? (r.arquivo ? "Cópia automática diária · atualizado em " + fmtDateTime(r.publicado_em) + (r.tamanho ? " · " + fmtSize(r.tamanho) : "")
                     : "Cópia automática · aguardando a primeira atualização")
        : link
        ? "Página online, sempre na versão mais recente · " + hostOf(link)
        : "Atualizado em " + fmtTimestamp(r.publicado_em) + (r.tamanho ? " · " + fmtSize(r.tamanho) : "");
      const abrir = link
        ? '<a class="btn btn-primary btn-sm" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Abrir relatório <span aria-hidden="true">↗</span><span class="sr-only"> (abre em nova aba)</span></a>'
        : '<button type="button" class="btn btn-primary btn-sm" data-open="' + esc(r.id) + '">Abrir relatório</button>';
      return '<article class="rel-card"><h3>' + esc(r.titulo) + "</h3>" + who +
        (r.descricao ? "<p>" + esc(r.descricao) + "</p>" : "") +
        '<span class="rel-meta">' + esc(meta) + "</span>" +
        '<div class="rel-actions">' + abrir +
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
    if (!r || r.url) {
      if (!push) history.replaceState(null, "", location.pathname + location.search);
      if (r) $("#relatorios").scrollIntoView();
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
    ["#rel-save", "#rel-cancel", "#rel-delete", "#rel-titulo", "#rel-descricao", "#rel-arquivo", "#rel-url"].forEach((s) => { $(s).disabled = on; });
    document.querySelectorAll('#rel-grupos input, input[name="rel-tipo"]').forEach((el) => { el.disabled = on; });
  }
  let relDeleteArmed = 0;
  function disarmRelDelete() {
    clearTimeout(relDeleteArmed); relDeleteArmed = 0;
    $("#rel-delete").textContent = "Excluir relatório";
    $("#rel-delete").classList.remove("btn-danger");
  }
  const AUTO_URL = /^https:\/\/claude\.ai\/(code\/)?artifact\/\S+$/i;
  function relTipo() {
    if (!linkSupport) return "arquivo";
    const v = (document.querySelector('input[name="rel-tipo"]:checked') || {}).value || "link";
    return v === "auto" && !autoSupport ? "link" : v;
  }
  function updateRelTipo() {
    const tipo = relTipo();
    const r = relEditing;
    $("#rel-tipo-field").hidden = !linkSupport;
    $("#rel-tipo-auto").hidden = !autoSupport;
    $("#rel-link-field").hidden = tipo !== "link" && tipo !== "auto";
    $("#rel-url-label").textContent = tipo === "auto" ? "Link do artefato do Claude" : "Link do relatório";
    $("#rel-url-hint").textContent = tipo === "auto"
      ? "Todo dia às 14h o robô copia a versão mais recente deste artefato para o portal. Quem usa o portal vê a cópia, sem precisar de conta no Claude e sem ver este link."
      : "Cole o endereço da página original. Abrir relatório leva direto para ela, sempre na versão mais recente. Cada pessoa precisa ter acesso a esse link: no Claude, compartilhe o relatório com ela pelo botão Compartilhar.";
    $("#rel-file-field").hidden = tipo !== "arquivo";
    const trocaArquivo = r && r.arquivo && tipo === "arquivo";
    $("#rel-arquivo-label").textContent = trocaArquivo ? "Substituir arquivo (opcional)" : "Arquivo do relatório (.html)";
    $("#rel-arquivo-hint").textContent = (trocaArquivo
      ? "Envie a versão nova do relatório para atualizar o que todos veem. Até 50 MB."
      : "O mesmo arquivo que abre no navegador com dois cliques. Até 50 MB.") +
      (linkSupport ? "" : " Para publicar por link, rode de novo o arquivo supabase/relatorios.sql no Supabase.");
  }
  function openRelPanel(r) {
    if (!canEdit || relSetupMissing) return;
    relEditing = r || null;
    $("#rel-title").textContent = r ? "Editar relatório" : "Publicar relatório";
    $("#rel-save").textContent = r ? "Salvar" : "Publicar";
    $("#rel-titulo").value = r ? r.titulo : "";
    $("#rel-descricao").value = r ? (r.descricao || "") : "";
    const marcados = r ? r.grupoIds : [];
    // Com a tabela de grupos: marca quantos quiser. Sem ela (banco antigo): escolhe um só.
    const tipo = multiGroups ? "checkbox" : "radio";
    $("#rel-grupos").innerHTML = (multiGroups ? "" :
        '<label class="check"><input type="radio" name="rel-grupo" value=""' + (marcados.length ? "" : " checked") + "> Somente equipe Copplasa (interno)</label>") +
      empresas.map((e) => '<label class="check"><input type="' + tipo + '" name="rel-grupo" value="' + esc(e.id) + '"' +
        (marcados.indexOf(e.id) >= 0 ? " checked" : "") + "> " + esc(e.nome) + "</label>").join("") +
      (empresas.length ? "" : '<p class="field-hint">Nenhum grupo cadastrado. Cadastre em Acessos.</p>');
    $("#rel-empresa-hint").textContent = multiGroups
      ? "Marque os grupos que podem ver. Sem nenhum marcado, o relatório é interno. A equipe Copplasa e os editores sempre veem todos."
      : "Para liberar um relatório para mais de um grupo, rode de novo o arquivo supabase/relatorios.sql no Supabase.";
    $("#rel-arquivo").value = "";
    $("#rel-url").value = r ? (r.fonte_url || r.url || "") : "";
    const tipoInicial = r ? (r.fonte_url ? "auto" : r.url ? "link" : "arquivo") : (autoSupport ? "auto" : "link");
    document.querySelectorAll('input[name="rel-tipo"]').forEach((el) => { el.checked = el.value === tipoInicial; });
    updateRelTipo();
    $("#rel-delete-zone").hidden = !r;
    disarmRelDelete();
    relStatus("");
    setRelBusy(false);
    if (!showPanel("rel-panel")) return;
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
    const escolhidos = [...document.querySelectorAll('#rel-grupos input[name="rel-grupo"]:checked')].map((el) => el.value).filter(Boolean);
    const tipo = relTipo();
    const file = tipo === "arquivo" ? ($("#rel-arquivo").files[0] || null) : null;
    const url = $("#rel-url").value.trim();
    if (!titulo) { relStatus("Dê um título ao relatório.", "err"); $("#rel-titulo").focus(); return; }
    if (tipo === "link" && !/^https:\/\/\S+$/i.test(url)) { relStatus("Cole o link completo do relatório, começando com https://.", "err"); $("#rel-url").focus(); return; }
    if (tipo === "auto" && !AUTO_URL.test(url)) { relStatus("Cole o link de um artefato do Claude, como https://claude.ai/artifact/...", "err"); $("#rel-url").focus(); return; }
    if (tipo === "arquivo" && !file && !(relEditing && relEditing.arquivo)) { relStatus("Escolha o arquivo .html do relatório.", "err"); $("#rel-arquivo").focus(); return; }
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
      const fields = { titulo, descricao, empresa_id: multiGroups ? null : (escolhidos[0] || null) };
      if (tipo === "link") { fields.url = url; fields.arquivo = null; fields.tamanho = null; }
      if (tipo === "auto") {
        fields.fonte_url = url;
        // Até a primeira cópia do robô, o relatório abre pelo link do artefato.
        if (!editing || !editing.arquivo) { fields.url = url; fields.arquivo = null; fields.tamanho = null; }
      } else if (autoSupport) fields.fonte_url = null;
      if (newPath) { fields.arquivo = newPath; fields.tamanho = file.size; if (linkSupport) fields.url = null; }
      const res = editing
        ? await sb.from("portal_relatorios").update(fields).eq("id", editing.id).select("id")
        : await sb.from("portal_relatorios").insert(fields).select("id");
      if (res.error) throw res.error;
      if (!res.data || !res.data.length) throw { code: "sem_permissao" };
      if (multiGroups) {
        const relId = res.data[0].id;
        const antes = editing ? editing.grupoIds : [];
        const novos = escolhidos.filter((id) => antes.indexOf(id) < 0);
        const tirar = antes.filter((id) => escolhidos.indexOf(id) < 0);
        if (novos.length) {
          const ins = await sb.from("portal_relatorio_grupos").insert(novos.map((id) => ({ relatorio_id: relId, empresa_id: id })));
          if (ins.error) throw { code: "grupos", relSaved: true, relId };
        }
        if (tirar.length) {
          const del = await sb.from("portal_relatorio_grupos").delete().eq("relatorio_id", relId).in("empresa_id", tirar);
          if (del.error) throw { code: "grupos", relSaved: true, relId };
        }
      }
      if (editing && editing.arquivo && (newPath || tipo === "link")) {
        reportCache.delete(editing.arquivo);
        try { await sb.storage.from("relatorios").remove([editing.arquivo]); } catch (_) {}
      }
      newPath = null;
      relBusy = false;
      closeRelPanel();
      toast(editing ? "Relatório atualizado." : "Relatório publicado.");
      await loadReports();
    } catch (e) {
      if (e && e.relSaved) {
        // O relatório foi salvo; só a liberação para os grupos falhou.
        relBusy = false;
        await loadReports();
        // Continua editando o relatório que já existe, para não criar outro ao tentar de novo.
        relEditing = reports.find((x) => x.id === e.relId) || relEditing;
        $("#rel-title").textContent = "Editar relatório";
        $("#rel-save").textContent = "Salvar";
        $("#rel-delete-zone").hidden = !relEditing;
        relStatus("O relatório foi salvo, mas não foi possível atualizar os grupos que podem ver. Abra Editar e tente de novo.", "err");
        return;
      }
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
    if (!showPanel("access-panel")) return;
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
      empresas.map((e) => '<option value="empresa:' + esc(e.id) + '">Grupo: ' + esc(e.nome) + "</option>").join("");
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
  function itemLabel(s, it, i) { return (it[s.req] || "").trim() || "Item " + (i + 1) + " sem título"; }
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
    if (!showPanel("editor")) return;
    if (!draft) draft = clone(state);
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
  // ---------- Aparência ----------
  async function loadBrand() {
    let r;
    try { r = await sb.from("portal_marca").select("dados, atualizado_em").eq("id", 1).maybeSingle(); }
    catch (_) { return; }
    if (r.error) { brandSetupMissing = true; return; }
    brandSetupMissing = false;
    const raw = r.data ? r.data.dados : {};
    brand = cleanBrand(raw);
    brandLoadedAt = r.data ? r.data.atualizado_em : null;
    writeBrandCache(raw);
    if (!brandDraft) applyBrand(brand);
  }
  const BRAND_TABS = [
    { k: "marca", label: "Marca e logos" },
    { k: "cores", label: "Cores" },
    { k: "tipografia", label: "Fontes e formato" },
    { k: "empresa", label: "Informações da empresa" }
  ];
  const brandDirty = () => !!brandDraft && !same(brandDraft, brand);
  function brandStatus(msg, kind, lock) {
    const el = $("#brand-status");
    el.textContent = msg || "";
    el.className = "ed-status" + (kind ? " " + kind : "");
    brandStatusLocked = !!lock;
  }
  function syncBrandUi() {
    $("#brand-publish").disabled = brandBusy || brandSetupMissing || !brandDirty();
    $("#brand-discard").disabled = brandBusy || !brandDirty();
    $("#brand-close").textContent = brandDirty() ? "Fechar sem publicar" : "Fechar";
    if (brandBusy || brandStatusLocked) return;
    if (brandSetupMissing) brandStatus("A aparência ainda não foi ativada no banco. Rode supabase/marca.sql no SQL Editor do Supabase para poder publicar.", "err");
    else brandStatus(brandDirty() ? "Prévia: só você está vendo estas mudanças até publicar." : "Nenhuma alteração.");
  }
  let brandPreviewTimer = 0;
  function brandChanged() {
    clearTimeout(brandPreviewTimer);
    brandPreviewTimer = setTimeout(() => { if (brandDraft) applyBrand(brandDraft); }, 60);
    if (!brandBusy) brandStatusLocked = false;
    syncBrandUi();
  }
  function openBrandPanel() {
    if (!canEdit) return;
    if (!showPanel("brand-panel")) return;
    brandDraft = clone(brand);
    brandStatusLocked = false;
    renderBrandTabs();
    renderBrandBody();
    syncBrandUi();
    $("#brand-title").focus();
  }
  let brandCloseArmed = 0;
  function closeBrandPanel(force) {
    if (brandBusy) return;
    const b = $("#brand-close");
    if (brandDirty() && !force && !brandCloseArmed) {
      b.textContent = "Confirmar: descartar e fechar";
      brandCloseArmed = setTimeout(() => { brandCloseArmed = 0; syncBrandUi(); }, 4000);
      return;
    }
    clearTimeout(brandCloseArmed); brandCloseArmed = 0;
    brandDraft = null;
    applyBrand(brand);
    $("#brand-panel").hidden = true;
    if (!anyPanelOpen()) hidePanels();
    if (!$("#open-brand").hidden) $("#open-brand").focus();
  }
  function renderBrandTabs() {
    $("#brand-tabs").innerHTML = BRAND_TABS.map((t) =>
      '<button type="button" class="ed-tab" data-btab="' + t.k + '" aria-pressed="' + (t.k === brandTab) + '">' + esc(t.label) + "</button>").join("");
  }
  function inputField(id, label, attrs, value, hint, textarea) {
    const ctl = textarea
      ? "<textarea id=\"" + id + "\" " + attrs + ' rows="3">' + esc(value) + "</textarea>"
      : "<input id=\"" + id + "\" " + attrs + ' value="' + esc(value) + '">';
    return '<div class="field"><label for="' + id + '">' + esc(label) + "</label>" + ctl + (hint ? '<p class="field-hint">' + esc(hint) + "</p>" : "") + "</div>";
  }
  function logoField(k, label, hint, bg) {
    return '<div class="field"><p class="field-label">' + esc(label) + "</p>" +
      '<div class="logo-field"><div class="logo-preview ' + bg + '"><img src="' + esc(safeImg(brandDraft[k]) || DEFAULT_BRAND[k]) + '" alt=""></div>' +
      '<div class="logo-actions"><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-logo-input="' + k + '" aria-label="Enviar ' + esc(label.toLowerCase()) + '">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-logo-reset="' + k + '">Usar o logo do site da Copplasa</button></div></div>' +
      '<p class="field-hint">' + esc(hint) + "</p></div>";
  }
  function colorWarnings(c) {
    const w = {};
    const ok = (k) => isHex(c[k]);
    if (ok("principal") && ok("fundo") && contrast(c.principal, c.fundo) < 3) w.principal = "Pouco contraste com o fundo: botões e links ficam difíceis de ver.";
    if (ok("texto") && ok("fundo") && contrast(c.texto, c.fundo) < 4.5) w.texto = "Pouco contraste com o fundo: o texto fica difícil de ler.";
    else if (ok("texto") && ok("fundoSuave") && contrast(c.texto, c.fundoSuave) < 4.5) w.texto = "Pouco contraste com o fundo suave: o texto das faixas fica difícil de ler.";
    if (ok("destaque") && ok("fundo") && contrast(c.destaque, c.fundo) < 3) w.destaque = "Pouco contraste com o fundo.";
    return w;
  }
  function renderColorWarnings() {
    const w = colorWarnings(brandDraft.cores);
    document.querySelectorAll("[data-color-warn]").forEach((el) => {
      const msg = w[el.dataset.colorWarn] || "";
      el.textContent = msg;
      el.hidden = !msg;
    });
  }
  function listRows(listKey, fields, addLabel) {
    const list = brandDraft.empresa[listKey];
    return list.map((it, i) =>
      '<div class="row-item"><div class="row-item-head"><span>' + esc(it[fields[0].k] || "Sem título") + "</span>" +
      '<button type="button" class="btn btn-ghost btn-sm" data-list-remove="' + listKey + '" data-idx="' + i + '">Remover</button></div>' +
      fields.map((f) => inputField("b-" + listKey + "-" + i + "-" + f.k, f.label, 'type="' + (f.url ? "url" : "text") + '" data-list="' + listKey + '" data-idx="' + i + '" data-f="' + f.k + '"' + (f.url ? ' placeholder="https://"' : ""), it[f.k] || "")).join("") +
      "</div>").join("") +
      '<button type="button" class="btn btn-ghost btn-sm ed-add" data-list-add="' + listKey + '">' + esc(addLabel) + "</button>";
  }
  function renderBrandBody() {
    const b = brandDraft;
    let html = "";
    if (brandTab === "marca") {
      html = inputField("b-nome", "Nome da empresa", 'type="text" maxlength="60" data-b="nome"', b.nome) +
        inputField("b-portalNome", "Nome do portal", 'type="text" maxlength="60" data-b="portalNome"', b.portalNome, "Aparece no topo, na tela de login e na aba do navegador.") +
        inputField("b-slogan", "Slogan", 'type="text" maxlength="120" data-b="slogan"', b.slogan) +
        inputField("b-loginTexto", "Texto da tela de login", 'maxlength="300" data-b="loginTexto"', b.loginTexto, "", true) +
        '<p class="ed-section-title">Logos</p>' +
        logoField("logo", "Logo colorido", "Topo do portal, sobre fundo branco. PNG, SVG, JPG ou WEBP.", "on-light") +
        logoField("logoClaro", "Logo branco", "Tela de login e rodapé, sobre fundo colorido.", "on-brand") +
        logoField("icone", "Ícone da aba do navegador", "Imagem quadrada. É reduzida automaticamente.", "on-icon");
    } else if (brandTab === "cores") {
      html = COLOR_KEYS.map(({ k, nome, uso }) =>
        '<div class="color-row"><input type="color" id="b-cor-' + k + '" data-color="' + k + '" value="' + esc((isHex(b.cores[k]) ? b.cores[k] : DEFAULT_BRAND.cores[k]).toLowerCase()) + '" aria-label="Cor ' + esc(nome.toLowerCase()) + '">' +
        '<div class="color-name"><strong>' + esc(nome) + "</strong><span>" + esc(uso) + "</span></div>" +
        '<input type="text" data-color-hex="' + k + '" value="' + esc(b.cores[k]) + '" maxlength="7" aria-label="Código da cor ' + esc(nome.toLowerCase()) + '">' +
        '<p class="color-warn" data-color-warn="' + k + '" hidden></p></div>').join("") +
        '<button type="button" class="btn btn-ghost btn-sm ed-add" data-reset="cores">Restaurar as cores do site da Copplasa</button>';
    } else if (brandTab === "tipografia") {
      const opts = (list, v) => list.map((n) => '<option value="' + esc(n) + '"' + (n === v ? " selected" : "") + ">" + esc(n) + "</option>").join("");
      html = '<div class="field"><label for="b-font-titulos">Fonte dos títulos</label><select id="b-font-titulos" data-font="titulos">' + opts(FONTS_TITULOS, b.fontes.titulos) + "</select>" +
          '<p class="font-sample" style="font-family: var(--font-display); text-transform: var(--title-transform)">Gestão de benefícios e seguros</p></div>' +
        '<div class="field"><label for="b-font-texto">Fonte dos textos</label><select id="b-font-texto" data-font="texto">' + opts(FONTS_TEXTO, b.fontes.texto) + "</select>" +
          '<p class="font-sample" style="font-family: var(--font-body); font-size: 1rem">Comunicados, relatórios e contatos para clientes, parceiros e equipe.</p></div>' +
        '<label class="check"><input type="checkbox" id="b-lower" data-b-check="titulosMinusculos"' + (b.titulosMinusculos ? " checked" : "") + "> Títulos em letras minúsculas, como no site da Copplasa</label>" +
        '<div class="field"><p class="field-label">Formato dos botões e cartões</p><div class="radio-group">' +
          Object.keys(FORMATOS).map((k) => '<label><input type="radio" name="b-formato" value="' + k + '"' + (b.formato === k ? " checked" : "") + "><span>" + esc(FORMATOS[k].nome) + "</span></label>").join("") +
        "</div></div>" +
        '<button type="button" class="btn btn-ghost btn-sm ed-add" data-reset="tipografia">Restaurar fontes e formato do site da Copplasa</button>';
    } else {
      const e = b.empresa;
      html = inputField("b-e-descricao", "Descrição curta (rodapé)", 'maxlength="300" data-e="descricao"', e.descricao, "", true) +
        inputField("b-e-email", "E-mail", 'type="email" maxlength="120" data-e="email"', e.email) +
        inputField("b-e-telefone", "Telefone", 'type="text" maxlength="30" data-e="telefone"', e.telefone, "Com DDD, por exemplo (11) 3000-0000.") +
        inputField("b-e-whatsapp", "WhatsApp", 'type="text" maxlength="30" data-e="whatsapp"', e.whatsapp, "Com DDD. Deixe em branco para não mostrar.") +
        inputField("b-e-site", "Site", 'type="url" maxlength="200" placeholder="https://" data-e="site"', e.site) +
        '<p class="ed-section-title">Redes sociais</p>' +
        Object.keys(SOCIAL).map((k) => inputField("b-r-" + k, SOCIAL[k].nome, 'type="url" maxlength="200" placeholder="https://" data-r="' + k + '"', (e.redes && e.redes[k]) || "")).join("") +
        '<p class="ed-section-title">Unidades</p>' +
        listRows("unidades", [{ k: "nome", label: "Nome" }, { k: "endereco", label: "Endereço" }, { k: "mapa", label: "Link do mapa (opcional)", url: true }], "Adicionar unidade") +
        '<p class="ed-section-title">Links do rodapé</p>' +
        listRows("links", [{ k: "titulo", label: "Título" }, { k: "url", label: "Endereço", url: true }], "Adicionar link") +
        '<button type="button" class="btn btn-ghost btn-sm ed-add" data-reset="empresa">Restaurar as informações do site da Copplasa</button>';
    }
    $("#brand-body").innerHTML = html;
    if (brandTab === "cores") renderColorWarnings();
  }
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }
  async function readImage(file, maxSide) {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error("tipo");
    if (file.type === "image/svg+xml") {
      if (file.size > 300 * 1024) throw new Error("grande");
      return fileToDataUrl(file);
    }
    if (file.size > 10 * 1024 * 1024) throw new Error("grande");
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(bmp.width * scale));
    cv.height = Math.max(1, Math.round(bmp.height * scale));
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    let url = cv.toDataURL("image/png");
    if (url.length > 450 * 1024) url = cv.toDataURL("image/webp", 0.9);
    if (url.length > 450 * 1024) throw new Error("grande");
    return url;
  }
  async function onLogoFile(input) {
    const k = input.dataset.logoInput;
    const file = input.files && input.files[0];
    if (!file || !brandDraft) return;
    brandStatus("Preparando a imagem...", "", true);
    try {
      brandDraft[k] = await readImage(file, k === "icone" ? 128 : 900);
      brandStatusLocked = false;
      renderBrandBody();
      brandChanged();
    } catch (e) {
      brandStatus(e && e.message === "tipo" ? "Use uma imagem PNG, JPG, WEBP ou SVG."
        : e && e.message === "grande" ? "A imagem é grande demais. Use um arquivo menor (SVG até 300 KB)."
        : "Não foi possível ler essa imagem. Tente outro arquivo.", "err", true);
      input.value = "";
    }
  }
  function onBrandInput(e) {
    const el = e.target;
    if (!brandDraft || !el.dataset) return;
    const d = el.dataset;
    if (d.b) brandDraft[d.b] = el.value;
    else if (d.e) brandDraft.empresa[d.e] = el.value.trim() === "" ? "" : el.value;
    else if (d.r) brandDraft.empresa.redes[d.r] = el.value.trim();
    else if (d.list) {
      const it = brandDraft.empresa[d.list][+d.idx];
      if (!it) return;
      it[d.f] = el.value;
      if (d.f === "nome" || d.f === "titulo") {
        const head = el.closest(".row-item").querySelector(".row-item-head span");
        if (head) head.textContent = el.value || "Sem título";
      }
    } else if (d.color) {
      brandDraft.cores[d.color] = el.value.toUpperCase();
      const hex = $('#brand-body [data-color-hex="' + d.color + '"]');
      if (hex) hex.value = brandDraft.cores[d.color];
      renderColorWarnings();
    } else if (d.colorHex) {
      let v = el.value.trim();
      if (v && v[0] !== "#") v = "#" + v;
      brandDraft.cores[d.colorHex] = v.toUpperCase();
      if (isHex(v)) { const sw = $('#brand-body [data-color="' + d.colorHex + '"]'); if (sw) sw.value = v.toLowerCase(); }
      renderColorWarnings();
    } else if (d.font) brandDraft.fontes[d.font] = el.value;
    else if (d.bCheck) brandDraft[d.bCheck] = el.checked;
    else if (el.name === "b-formato") brandDraft.formato = el.value;
    else if (d.logoInput) { if (e.type === "change") onLogoFile(el); return; }
    else return;
    brandChanged();
  }
  function validateBrand(b) {
    for (const { k, nome } of COLOR_KEYS) {
      if (!isHex(b.cores[k])) return { tab: "cores", id: null, msg: "O código da cor " + nome.toLowerCase() + " precisa estar no formato #RRGGBB, por exemplo #006CD1." };
    }
    if (!String(b.nome).trim()) return { tab: "marca", id: "b-nome", msg: "Preencha o nome da empresa." };
    if (!String(b.portalNome).trim()) return { tab: "marca", id: "b-portalNome", msg: "Preencha o nome do portal." };
    const e = b.empresa;
    if (e.email && !/^\S+@\S+\.\S+$/.test(e.email)) return { tab: "empresa", id: "b-e-email", msg: "O e-mail não parece válido." };
    const badUrl = (u) => u && !safeUrl(u);
    if (badUrl(e.site)) return { tab: "empresa", id: "b-e-site", msg: "O site precisa começar com https://." };
    for (const k of Object.keys(SOCIAL)) if (badUrl(e.redes[k])) return { tab: "empresa", id: "b-r-" + k, msg: "O link do " + SOCIAL[k].nome + " precisa começar com https://." };
    for (let i = 0; i < e.unidades.length; i++) if (badUrl(e.unidades[i].mapa)) return { tab: "empresa", id: "b-unidades-" + i + "-mapa", msg: "O link do mapa da unidade " + (i + 1) + " precisa começar com https://." };
    for (let i = 0; i < e.links.length; i++) {
      if (!String(e.links[i].titulo || "").trim()) return { tab: "empresa", id: "b-links-" + i + "-titulo", msg: "Dê um título ao link " + (i + 1) + " do rodapé." };
      if (!safeUrl(e.links[i].url)) return { tab: "empresa", id: "b-links-" + i + "-url", msg: "O link " + (i + 1) + " do rodapé precisa começar com https://." };
    }
    if (JSON.stringify(b).length > 1.5 * 1024 * 1024) return { tab: "marca", id: null, msg: "Os logos estão grandes demais. Use imagens menores." };
    return null;
  }
  async function publishBrand() {
    if (!brandDirty() || brandBusy || brandSetupMissing) return;
    const problem = validateBrand(brandDraft);
    if (problem) {
      brandTab = problem.tab; renderBrandTabs(); renderBrandBody();
      brandStatus(problem.msg, "err", true);
      const el = problem.id && document.getElementById(problem.id);
      if (el) { el.focus(); el.scrollIntoView({ block: "center" }); }
      return;
    }
    brandBusy = true; syncBrandUi(); brandStatus("Publicando...", "", true);
    try {
      let q = sb.from("portal_marca").update({ dados: brandDraft }).eq("id", 1);
      if (brandLoadedAt) q = q.eq("atualizado_em", brandLoadedAt);
      const { data, error } = await q.select("dados, atualizado_em");
      if (error) throw error;
      brandBusy = false;
      if (!data || !data.length) {
        brandStatus("Não foi possível publicar: outra pessoa publicou uma aparência mais nova ou seu acesso não permite. Recarregue a página e tente de novo.", "err", true);
        syncBrandUi();
        return;
      }
      brand = cleanBrand(data[0].dados);
      brandLoadedAt = data[0].atualizado_em;
      writeBrandCache(data[0].dados);
      brandStatusLocked = false;
      closeBrandPanel(true);
      toast("Aparência publicada.");
    } catch (_) {
      brandBusy = false;
      brandStatus("Não foi possível publicar. Verifique sua conexão e tente de novo; suas alterações continuam aqui.", "err", true);
      syncBrandUi();
    }
  }

  $("#open-brand").addEventListener("click", openBrandPanel);
  $("#brand-close").addEventListener("click", () => closeBrandPanel(false));
  $("#brand-publish").addEventListener("click", publishBrand);
  $("#brand-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-btab]");
    if (!b) return;
    brandTab = b.dataset.btab; renderBrandTabs(); renderBrandBody();
  });
  $("#brand-body").addEventListener("input", onBrandInput);
  $("#brand-body").addEventListener("change", onBrandInput);
  $("#brand-body").addEventListener("click", (e) => {
    if (!brandDraft) return;
    const t = e.target.closest("[data-logo-reset], [data-list-add], [data-list-remove], [data-reset]");
    if (!t) return;
    const d = t.dataset;
    if (d.logoReset) brandDraft[d.logoReset] = DEFAULT_BRAND[d.logoReset];
    else if (d.listAdd) brandDraft.empresa[d.listAdd].push(d.listAdd === "unidades" ? { nome: "", endereco: "", mapa: "" } : { titulo: "", url: "" });
    else if (d.listRemove) brandDraft.empresa[d.listRemove].splice(+d.idx, 1);
    else if (d.reset === "cores") brandDraft.cores = clone(DEFAULT_BRAND.cores);
    else if (d.reset === "tipografia") { brandDraft.fontes = clone(DEFAULT_BRAND.fontes); brandDraft.titulosMinusculos = DEFAULT_BRAND.titulosMinusculos; brandDraft.formato = DEFAULT_BRAND.formato; }
    else if (d.reset === "empresa") brandDraft.empresa = clone(DEFAULT_BRAND.empresa);
    renderBrandBody();
    brandChanged();
  });
  let brandDiscardArmed = 0;
  $("#brand-discard").addEventListener("click", () => {
    const b = $("#brand-discard");
    if (!brandDiscardArmed) {
      b.textContent = "Confirmar descarte";
      b.classList.add("btn-danger");
      brandDiscardArmed = setTimeout(() => { brandDiscardArmed = 0; b.textContent = "Descartar alterações"; b.classList.remove("btn-danger"); }, 4000);
      return;
    }
    clearTimeout(brandDiscardArmed); brandDiscardArmed = 0;
    b.textContent = "Descartar alterações"; b.classList.remove("btn-danger");
    brandDraft = clone(brand);
    applyBrand(brand);
    brandStatusLocked = false;
    renderBrandBody(); syncBrandUi();
    brandStatus("Alterações descartadas.");
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
  $("#rel-form").addEventListener("change", (e) => { if (e.target.name === "rel-tipo") updateRelTipo(); });
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
    else if (!$("#brand-panel").hidden) closeBrandPanel(false);
    else if (!$("#rel-panel").hidden) closeRelPanel();
    else if (!$("#access-panel").hidden) $("#access-close").click();
  });

  // ---------- Início ----------
  async function boot() {
    if (!configured || !window.supabase || typeof window.supabase.createClient !== "function") { showForm("setup"); return; }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    loadBrand();
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
  applyBrand(brand);
  boot();
})();
