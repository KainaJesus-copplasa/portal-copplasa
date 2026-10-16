-- =====================================================================
-- Portal Copplasa: aparência editável (marca, cores, fontes, logos e
-- informações da empresa) e contatos alinhados ao site copplasa.com.br.
-- Rode depois de setup.sql e relatorios.sql. No painel do Supabase, abra
-- "SQL Editor", cole este arquivo inteiro e clique em "Run".
-- Pode rodar de novo sem perder dados.
-- =====================================================================

-- ---------- 1. Aparência ----------
-- Fica visível também para quem não fez login, porque a tela de login usa
-- o logo e as cores. Só editores alteram.
create table if not exists public.portal_marca (
  id smallint primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

alter table public.portal_marca enable row level security;
revoke all on public.portal_marca from anon, authenticated;
grant select on public.portal_marca to anon, authenticated;
grant update (dados) on public.portal_marca to authenticated;

drop trigger if exists portal_marca_atualizacao on public.portal_marca;
create trigger portal_marca_atualizacao
  before update on public.portal_marca
  for each row execute function public.portal_marca_atualizacao();

drop policy if exists "Todos veem a aparencia" on public.portal_marca;
create policy "Todos veem a aparencia" on public.portal_marca for select
  to anon, authenticated
  using (true);
drop policy if exists "Editores alteram a aparencia" on public.portal_marca;
create policy "Editores alteram a aparencia" on public.portal_marca for update
  to authenticated
  using ((select public.portal_eh_editor()))
  with check ((select public.portal_eh_editor()));

-- Vazio = usa a aparência padrão do site da Copplasa (definida no site).
insert into public.portal_marca (id, dados) values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- ---------- 2. Contatos com as informações do site ----------
-- Só troca a seção se ela ainda estiver com o conteúdo de exemplo original.
-- Se você já editou "Contatos" pelo portal, nada muda.
update public.portal_conteudo
set dados = jsonb_set(dados, '{contatos}', $j$[
 {
  "id": "k1",
  "area": "Fale com a Copplasa",
  "canal": "contato@copplasa.com.br",
  "horario": "Atendimento a clientes e novos negócios",
  "exemplo": false
 },
 {
  "id": "k2",
  "area": "Comercial e novos negócios",
  "canal": "Telefone e e-mail a cadastrar",
  "horario": "Dias e horários a definir",
  "exemplo": true
 },
 {
  "id": "k3",
  "area": "Sinistros e reembolsos",
  "canal": "Telefone e e-mail a cadastrar",
  "horario": "Dias e horários a definir",
  "exemplo": true
 }
]$j$::jsonb)
where id = 1
  and dados->'contatos' = $j$[{"id": "k1", "area": "Atendimento a clientes", "canal": "Telefone e e-mail a cadastrar", "horario": "Dias e horários a definir", "exemplo": true}, {"id": "k2", "area": "Comercial e novos negócios", "canal": "Telefone e e-mail a cadastrar", "horario": "Dias e horários a definir", "exemplo": true}, {"id": "k3", "area": "Sinistros e reembolsos", "canal": "Telefone e e-mail a cadastrar", "horario": "Dias e horários a definir", "exemplo": true}]$j$::jsonb;
