-- =====================================================================
-- Portal Copplasa: estrutura do banco e regras de acesso (Supabase)
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este arquivo
-- inteiro e clique em "Run". Pode rodar de novo sem perder o conteúdo.
-- =====================================================================

-- Conteúdo do portal (uma única linha, id = 1)
create table if not exists public.portal_conteudo (
  id smallint primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

-- Quem pode editar o conteúdo
create table if not exists public.portal_editores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.portal_conteudo enable row level security;
alter table public.portal_editores enable row level security;

-- Visitantes sem login não acessam nada; usuários logados só leem e,
-- se forem editores, atualizam o campo "dados".
revoke all on public.portal_conteudo from anon, authenticated;
revoke all on public.portal_editores from anon, authenticated;
grant select on public.portal_conteudo to authenticated;
grant update (dados) on public.portal_conteudo to authenticated;
grant select on public.portal_editores to authenticated;

create or replace function public.portal_eh_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.portal_editores where user_id = auth.uid());
$$;
revoke all on function public.portal_eh_editor() from public, anon;
grant execute on function public.portal_eh_editor() to authenticated;

-- Registra data e autor de cada publicação
create or replace function public.portal_marca_atualizacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists portal_conteudo_atualizacao on public.portal_conteudo;
create trigger portal_conteudo_atualizacao
  before update on public.portal_conteudo
  for each row execute function public.portal_marca_atualizacao();

drop policy if exists "Usuarios logados leem o conteudo" on public.portal_conteudo;
create policy "Usuarios logados leem o conteudo"
  on public.portal_conteudo for select
  to authenticated
  using (true);

drop policy if exists "Editores atualizam o conteudo" on public.portal_conteudo;
create policy "Editores atualizam o conteudo"
  on public.portal_conteudo for update
  to authenticated
  using ((select public.portal_eh_editor()))
  with check ((select public.portal_eh_editor()));

drop policy if exists "Cada pessoa ve o proprio papel" on public.portal_editores;
create policy "Cada pessoa ve o proprio papel"
  on public.portal_editores for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Conteúdo inicial (só é inserido se ainda não existir)
insert into public.portal_conteudo (id, dados)
values (1, $json$
{
  "portal": {
    "boasVindas": "Comunicados, informações sobre produtos e canais de atendimento da Copplasa Corretora de Seguros, reunidos em um só lugar."
  },
  "avisos": [
    {
      "id": "a1",
      "data": "2026-10-15",
      "titulo": "Portal Copplasa no ar",
      "texto": "Este é o novo espaço da Copplasa para comunicados, informações sobre produtos e contatos de atendimento. As novidades passam a ser publicadas aqui.",
      "exemplo": true
    },
    {
      "id": "a2",
      "data": "2026-10-08",
      "titulo": "Revisão anual dos planos empresariais",
      "texto": "Empresas com aniversário de contrato nos próximos meses vão receber contato da equipe comercial para revisar coberturas, rede credenciada e reajuste.",
      "exemplo": true
    }
  ],
  "produtos": [
    {
      "id": "p1",
      "grupo": "Saúde e benefícios",
      "nome": "Plano de saúde empresarial",
      "resumo": "Assistência médica e hospitalar para colaboradores e dependentes, para empresas de todos os portes, inclusive PME.",
      "pontos": "Abrangência regional ou nacional, conforme a rede escolhida\nPode ter coparticipação, que reduz a mensalidade\nCom 30 ou mais vidas, quem entra em até 30 dias não cumpre carência"
    },
    {
      "id": "p2",
      "grupo": "Saúde e benefícios",
      "nome": "Plano odontológico",
      "resumo": "Consultas, limpeza, restaurações, tratamento de canal e outros procedimentos previstos no rol da ANS.",
      "pontos": "Mensalidade bem menor que a do plano médico\nPode ser contratado junto com o plano de saúde ou separado"
    },
    {
      "id": "p3",
      "grupo": "Saúde e benefícios",
      "nome": "Seguro de vida em grupo",
      "resumo": "Indenização aos beneficiários em caso de morte e, conforme as coberturas contratadas, de invalidez por acidente ou doença.",
      "pontos": "Coberturas adicionais comuns: auxílio-funeral e diárias por incapacidade\nMuitas convenções coletivas exigem o seguro para os colaboradores"
    },
    {
      "id": "p4",
      "grupo": "Outros seguros",
      "nome": "Seguro auto",
      "resumo": "Proteção contra roubo, furto, colisão e danos a terceiros, com assistência 24 horas conforme a apólice.",
      "pontos": "A franquia escolhida muda o preço e o valor pago em sinistros parciais\nA classe de bônus reduz o preço na renovação"
    },
    {
      "id": "p5",
      "grupo": "Outros seguros",
      "nome": "Seguro residencial",
      "resumo": "Cobertura básica para incêndio, queda de raio e explosão, com opções como danos elétricos, roubo e responsabilidade civil.",
      "pontos": "Costuma incluir assistências como chaveiro, encanador e eletricista\nVale para casa ou apartamento, próprio ou alugado"
    },
    {
      "id": "p6",
      "grupo": "Outros seguros",
      "nome": "Seguro pet",
      "resumo": "Planos para cães e gatos com consultas, vacinas, exames e atendimento de emergência, conforme o plano escolhido.",
      "pontos": "Pode haver carência para alguns procedimentos\nA idade máxima para contratação varia de empresa para empresa"
    }
  ],
  "carencias": [
    {
      "id": "c1",
      "prazo": "24 horas",
      "descricao": "Urgência e emergência"
    },
    {
      "id": "c2",
      "prazo": "180 dias",
      "descricao": "Consultas, exames, internações e cirurgias"
    },
    {
      "id": "c3",
      "prazo": "300 dias",
      "descricao": "Parto a termo"
    }
  ],
  "faq": [
    {
      "id": "f1",
      "pergunta": "O que é carência?",
      "resposta": "É o período, contado a partir da entrada no plano, em que algumas coberturas ainda não podem ser usadas. A lei define prazos máximos: 24 horas para urgência e emergência, 300 dias para parto a termo e 180 dias para os demais casos."
    },
    {
      "id": "f2",
      "pergunta": "Plano empresarial tem carência?",
      "resposta": "Depende do número de beneficiários. Em contratos com 30 ou mais vidas, quem entra no plano em até 30 dias da contratação ou da admissão na empresa não cumpre carência. Em contratos menores, a operadora pode aplicar carência."
    },
    {
      "id": "f3",
      "pergunta": "O que é coparticipação?",
      "resposta": "É um valor que o beneficiário paga ao usar alguns serviços, como consultas e exames, além da mensalidade. Em troca, a mensalidade costuma ser menor. Os percentuais e limites ficam definidos no contrato."
    },
    {
      "id": "f4",
      "pergunta": "Posso trocar de plano sem cumprir nova carência?",
      "resposta": "Sim, pela portabilidade de carências, desde que os requisitos da ANS sejam cumpridos, como tempo mínimo no plano atual e mensalidades em dia. A equipe Copplasa verifica se o seu caso se encaixa."
    },
    {
      "id": "f5",
      "pergunta": "O que fazer em caso de acidente com o carro?",
      "resposta": "Garanta a segurança de todos e registre boletim de ocorrência quando houver vítimas, roubo ou furto. Avise a Copplasa e a seguradora o quanto antes.\nNão assuma culpa nem faça acordos com terceiros sem falar com a seguradora."
    },
    {
      "id": "f6",
      "pergunta": "Como envio documentos com dados pessoais?",
      "resposta": "Não envie CPF, dados de saúde ou documentos de apólices e sinistros por este portal. Use o e-mail ou a pasta compartilhada indicados pela sua pessoa de contato na Copplasa."
    }
  ],
  "links": [
    {
      "id": "l1",
      "titulo": "Agência Nacional de Saúde Suplementar (ANS)",
      "descricao": "Regras dos planos de saúde, rol de coberturas e consulta de operadoras.",
      "url": "https://www.gov.br/ans/pt-br"
    },
    {
      "id": "l2",
      "titulo": "Superintendência de Seguros Privados (SUSEP)",
      "descricao": "Consulta de seguradoras e corretores autorizados a operar.",
      "url": "https://www.gov.br/susep/pt-br"
    },
    {
      "id": "l3",
      "titulo": "Apresentação institucional da Copplasa",
      "descricao": "Cole aqui o link do material no Google Drive corporativo e confira se o arquivo está compartilhado com quem acessa o portal.",
      "url": ""
    }
  ],
  "contatos": [
    {
      "id": "k1",
      "area": "Atendimento a clientes",
      "canal": "Telefone e e-mail a cadastrar",
      "horario": "Dias e horários a definir",
      "exemplo": true
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
  ]
}
$json$::jsonb)
on conflict (id) do nothing;
