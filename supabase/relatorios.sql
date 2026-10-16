-- =====================================================================
-- Portal Copplasa: relatórios, empresas e acessos (Supabase)
-- Rode depois de setup.sql. No painel do Supabase, abra "SQL Editor",
-- cole este arquivo inteiro e clique em "Run". Pode rodar de novo sem
-- perder dados.
--
-- Regras:
--   * Equipe Copplasa (e quem é editor) vê todos os relatórios.
--   * Cada login pode estar ligado a um grupo (empresa cliente ou time).
--   * Cada relatório pode ser liberado para um ou mais grupos; quem está
--     num desses grupos vê o relatório.
--   * Relatório sem grupo é interno: só a equipe vê.
--   * Um relatório pode ser um arquivo .html guardado aqui ou um link para
--     a página original (por exemplo, um relatório publicado no Claude).
--   * Relatório com "cópia automática" (fonte_url) guarda o link de um artefato
--     do Claude; todo dia o robô copia a versão mais recente dele para cá.
--   * O robô de atualização automática (tabela portal_robos) vê todos os
--     relatórios e só pode trocar o arquivo dos que têm cópia automática.
--   * Só editores publicam, trocam ou apagam relatórios e definem acessos.
--   * Os arquivos ficam num bucket privado; o download segue as mesmas regras.
-- =====================================================================

create table if not exists public.portal_empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(trim(nome)) > 0),
  criado_em timestamptz not null default now()
);

create table if not exists public.portal_perfis (
  user_id uuid primary key references auth.users (id) on delete cascade,
  equipe boolean not null default false,
  empresa_id uuid references public.portal_empresas (id) on delete set null,
  atualizado_em timestamptz not null default now()
);

-- Logins do robô que atualiza os arquivos dos relatórios automaticamente
create table if not exists public.portal_robos (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

create table if not exists public.portal_relatorios (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text not null default '',
  -- null = relatório interno, só a equipe vê
  empresa_id uuid references public.portal_empresas (id) on delete restrict,
  arquivo text not null unique,
  tamanho bigint,
  publicado_em timestamptz not null default now(),
  publicado_por uuid references auth.users (id) on delete set null
);
create index if not exists portal_relatorios_empresa_idx on public.portal_relatorios (empresa_id);

-- Relatório por link: guarda o endereço da página original em vez do arquivo
alter table public.portal_relatorios add column if not exists url text;
alter table public.portal_relatorios alter column arquivo drop not null;
alter table public.portal_relatorios drop constraint if exists portal_relatorios_arquivo_ou_link;
alter table public.portal_relatorios add constraint portal_relatorios_arquivo_ou_link check (
  (arquivo is not null and url is null)
  or (arquivo is null and url is not null and url ~ '^https://[^[:space:]]+$')
);

-- Cópia automática: link do artefato de onde o robô copia a versão mais recente
alter table public.portal_relatorios add column if not exists fonte_url text;
alter table public.portal_relatorios drop constraint if exists portal_relatorios_fonte_https;
alter table public.portal_relatorios add constraint portal_relatorios_fonte_https check (
  fonte_url is null or fonte_url ~ '^https://[^[:space:]]+$'
);

-- Grupos que podem ver cada relatório (um relatório pode ter vários)
create table if not exists public.portal_relatorio_grupos (
  relatorio_id uuid not null references public.portal_relatorios (id) on delete cascade,
  empresa_id uuid not null references public.portal_empresas (id) on delete cascade,
  primary key (relatorio_id, empresa_id)
);
create index if not exists portal_relatorio_grupos_empresa_idx on public.portal_relatorio_grupos (empresa_id);

alter table public.portal_empresas enable row level security;
alter table public.portal_perfis enable row level security;
alter table public.portal_relatorios enable row level security;
alter table public.portal_relatorio_grupos enable row level security;
alter table public.portal_robos enable row level security;

revoke all on public.portal_empresas from anon, authenticated;
revoke all on public.portal_perfis from anon, authenticated;
revoke all on public.portal_relatorios from anon, authenticated;
revoke all on public.portal_relatorio_grupos from anon, authenticated;
revoke all on public.portal_robos from anon, authenticated;
grant select, insert, delete on public.portal_relatorio_grupos to authenticated;
grant select, insert, delete on public.portal_empresas to authenticated;
grant update (nome) on public.portal_empresas to authenticated;
grant select on public.portal_perfis to authenticated;
grant select, delete on public.portal_relatorios to authenticated;
grant insert (titulo, descricao, empresa_id, arquivo, tamanho, url, fonte_url) on public.portal_relatorios to authenticated;
grant update (titulo, descricao, empresa_id, arquivo, tamanho, url, fonte_url) on public.portal_relatorios to authenticated;

-- ---------- Funções de apoio ----------
create or replace function public.portal_eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.portal_perfis where user_id = auth.uid() and equipe)
      or exists (select 1 from public.portal_editores where user_id = auth.uid())
      or exists (select 1 from public.portal_robos where user_id = auth.uid());
$$;

create or replace function public.portal_eh_robo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.portal_robos where user_id = auth.uid());
$$;

create or replace function public.portal_minha_empresa()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select empresa_id from public.portal_perfis where user_id = auth.uid();
$$;

revoke all on function public.portal_eh_equipe() from public, anon;
revoke all on function public.portal_eh_robo() from public, anon;
grant execute on function public.portal_eh_robo() to authenticated;
revoke all on function public.portal_minha_empresa() from public, anon;
grant execute on function public.portal_eh_equipe() to authenticated;
grant execute on function public.portal_minha_empresa() to authenticated;

-- Data e autor de cada publicação
create or replace function public.portal_marca_relatorio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.publicado_em := now();
    new.publicado_por := auth.uid();
  elsif new.arquivo is distinct from old.arquivo or new.url is distinct from old.url then
    new.publicado_em := now();
    new.publicado_por := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists portal_relatorios_marca on public.portal_relatorios;
create trigger portal_relatorios_marca
  before insert or update on public.portal_relatorios
  for each row execute function public.portal_marca_relatorio();

-- ---------- Regras de acesso às tabelas ----------
drop policy if exists "Empresas visiveis" on public.portal_empresas;
create policy "Empresas visiveis" on public.portal_empresas for select to authenticated
  using ((select public.portal_eh_equipe()) or id = (select public.portal_minha_empresa()));
drop policy if exists "Editores cadastram empresas" on public.portal_empresas;
create policy "Editores cadastram empresas" on public.portal_empresas for insert to authenticated
  with check ((select public.portal_eh_editor()));
drop policy if exists "Editores renomeiam empresas" on public.portal_empresas;
create policy "Editores renomeiam empresas" on public.portal_empresas for update to authenticated
  using ((select public.portal_eh_editor())) with check ((select public.portal_eh_editor()));
drop policy if exists "Editores removem empresas" on public.portal_empresas;
create policy "Editores removem empresas" on public.portal_empresas for delete to authenticated
  using ((select public.portal_eh_editor()));

drop policy if exists "Perfil proprio ou editor" on public.portal_perfis;
create policy "Perfil proprio ou editor" on public.portal_perfis for select to authenticated
  using (user_id = (select auth.uid()) or (select public.portal_eh_editor()));

drop policy if exists "Relatorios conforme acesso" on public.portal_relatorios;
create policy "Relatorios conforme acesso" on public.portal_relatorios for select to authenticated
  using (
    (select public.portal_eh_equipe())
    or exists (
      select 1 from public.portal_relatorio_grupos g
      where g.relatorio_id = portal_relatorios.id
        and g.empresa_id = (select public.portal_minha_empresa())
    )
  );

drop policy if exists "Grupos do relatorio visiveis" on public.portal_relatorio_grupos;
create policy "Grupos do relatorio visiveis" on public.portal_relatorio_grupos for select to authenticated
  using ((select public.portal_eh_equipe()) or empresa_id = (select public.portal_minha_empresa()));
drop policy if exists "Editores liberam relatorios" on public.portal_relatorio_grupos;
create policy "Editores liberam relatorios" on public.portal_relatorio_grupos for insert to authenticated
  with check ((select public.portal_eh_editor()));
drop policy if exists "Editores retiram relatorios" on public.portal_relatorio_grupos;
create policy "Editores retiram relatorios" on public.portal_relatorio_grupos for delete to authenticated
  using ((select public.portal_eh_editor()));
drop policy if exists "Editores publicam relatorios" on public.portal_relatorios;
create policy "Editores publicam relatorios" on public.portal_relatorios for insert to authenticated
  with check ((select public.portal_eh_editor()));
drop policy if exists "Editores alteram relatorios" on public.portal_relatorios;
create policy "Editores alteram relatorios" on public.portal_relatorios for update to authenticated
  using ((select public.portal_eh_editor())) with check ((select public.portal_eh_editor()));
drop policy if exists "Editores apagam relatorios" on public.portal_relatorios;
create policy "Editores apagam relatorios" on public.portal_relatorios for delete to authenticated
  using ((select public.portal_eh_editor()));

-- ---------- Gestão de acessos pelo site (só editores) ----------
create or replace function public.portal_listar_acessos()
returns table (user_id uuid, email text, equipe boolean, editor boolean, empresa_id uuid, ultimo_acesso timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.portal_eh_editor() then
    raise exception 'Sem permissão para ver os acessos' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, coalesce(p.equipe, false), (e.user_id is not null), p.empresa_id, u.last_sign_in_at
    from auth.users u
    left join public.portal_perfis p on p.user_id = u.id
    left join public.portal_editores e on e.user_id = u.id
    order by u.email;
end;
$$;

create or replace function public.portal_definir_acesso(p_user_id uuid, p_equipe boolean, p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.portal_eh_editor() then
    raise exception 'Sem permissão para alterar acessos' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Login não encontrado' using errcode = 'P0002';
  end if;
  insert into public.portal_perfis (user_id, equipe, empresa_id, atualizado_em)
  values (p_user_id, coalesce(p_equipe, false), case when coalesce(p_equipe, false) then null else p_empresa_id end, now())
  on conflict (user_id) do update
    set equipe = excluded.equipe, empresa_id = excluded.empresa_id, atualizado_em = now();
end;
$$;

revoke all on function public.portal_listar_acessos() from public, anon;
revoke all on function public.portal_definir_acesso(uuid, boolean, uuid) from public, anon;
grant execute on function public.portal_listar_acessos() to authenticated;
grant execute on function public.portal_definir_acesso(uuid, boolean, uuid) to authenticated;

-- ---------- Arquivos dos relatórios (bucket privado) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('relatorios', 'relatorios', false, 52428800, array['text/html'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Download: editores, ou quem pode ver o relatório que aponta para o arquivo
drop policy if exists "Relatorios: baixar conforme acesso" on storage.objects;
create policy "Relatorios: baixar conforme acesso" on storage.objects for select to authenticated
  using (
    bucket_id = 'relatorios'
    and (
      (select public.portal_eh_editor())
      or (select public.portal_eh_robo())
      or exists (select 1 from public.portal_relatorios r where r.arquivo = storage.objects.name)
    )
  );
drop policy if exists "Relatorios: editores enviam" on storage.objects;
create policy "Relatorios: editores enviam" on storage.objects for insert to authenticated
  with check (bucket_id = 'relatorios' and (select public.portal_eh_editor()));
drop policy if exists "Relatorios: editores substituem" on storage.objects;
create policy "Relatorios: editores substituem" on storage.objects for update to authenticated
  using (bucket_id = 'relatorios' and (select public.portal_eh_editor()))
  with check (bucket_id = 'relatorios' and (select public.portal_eh_editor()));
drop policy if exists "Relatorios: editores apagam" on storage.objects;
create policy "Relatorios: editores apagam" on storage.objects for delete to authenticated
  using (bucket_id = 'relatorios' and (select public.portal_eh_editor()));

-- ---------- Robô de atualização automática ----------
-- Envia arquivos novos e apaga só arquivos que nenhum relatório usa mais.
drop policy if exists "Relatorios: robo envia" on storage.objects;
create policy "Relatorios: robo envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'relatorios' and (select public.portal_eh_robo()));
drop policy if exists "Relatorios: robo apaga sobras" on storage.objects;
create policy "Relatorios: robo apaga sobras" on storage.objects for delete to authenticated
  using (
    bucket_id = 'relatorios'
    and (select public.portal_eh_robo())
    and not exists (select 1 from public.portal_relatorios r where r.arquivo = storage.objects.name)
  );

-- Aponta o relatório (só os que têm cópia automática) para o arquivo novo e
-- devolve o nome do arquivo antigo.
create or replace function public.portal_robo_trocar_arquivo(p_relatorio uuid, p_arquivo text, p_tamanho bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antigo text;
  v_fonte text;
begin
  if not public.portal_eh_robo() then
    raise exception 'Sem permissão para atualizar relatórios' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'relatorios' and name = p_arquivo) then
    raise exception 'Arquivo novo não encontrado' using errcode = 'P0002';
  end if;
  select arquivo, fonte_url into v_antigo, v_fonte from public.portal_relatorios where id = p_relatorio for update;
  if not found then
    raise exception 'Relatório não encontrado' using errcode = 'P0002';
  end if;
  if v_fonte is null then
    raise exception 'Relatório sem cópia automática' using errcode = '42501';
  end if;
  update public.portal_relatorios
    set arquivo = p_arquivo, tamanho = p_tamanho, url = null
    where id = p_relatorio;
  return v_antigo;
end;
$$;
revoke all on function public.portal_robo_trocar_arquivo(uuid, text, bigint) from public, anon;
grant execute on function public.portal_robo_trocar_arquivo(uuid, text, bigint) to authenticated;

-- ---------- Atualizações ----------
-- Relatórios publicados antes dos grupos múltiplos: passa o grupo único
-- para a nova tabela (pode rodar de novo sem duplicar).
insert into public.portal_relatorio_grupos (relatorio_id, empresa_id)
select id, empresa_id from public.portal_relatorios where empresa_id is not null
on conflict do nothing;
update public.portal_relatorios set empresa_id = null where empresa_id is not null;

-- Grupo pedido pela equipe
insert into public.portal_empresas (nome) values ('Equipe Copplasa 2')
on conflict (nome) do nothing;
