-- =====================================================================
-- Portal Copplasa: aparência editável (marca, cores, fontes, logos e
-- informações da empresa) e conteúdo alinhado ao site copplasa.com.br.
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

-- ---------- 2. Conteúdo com as informações do site ----------
-- Só troca as seções que ainda estão com o conteúdo de exemplo original.
-- Se você já editou "Soluções" ou "Contatos" pelo portal, nada muda.
update public.portal_conteudo
set dados = jsonb_set(dados, '{produtos}', $j$[
 {
  "id": "s1",
  "grupo": "Soluções corporativas",
  "nome": "Gestão de benefícios",
  "resumo": "Plano de saúde, plano odontológico, seguro de vida e previdência privada em grupo, com menos burocracia para o RH e atendimento próximo e humanizado.",
  "pontos": "Atendimento especializado 24h em todo o Brasil\nPlataformas de gestão e atendimento com acesso rápido"
 },
 {
  "id": "s2",
  "grupo": "Soluções corporativas",
  "nome": "Benefícios não seguráveis",
  "resumo": "Soluções que vão além dos planos de saúde, odontológico e seguro de vida, com mais liberdade e personalização para os colaboradores.",
  "pontos": "Autonomia, praticidade, engajamento e economia\nMais flexibilidade e menos burocracia na gestão"
 },
 {
  "id": "s3",
  "grupo": "Soluções corporativas",
  "nome": "Gestão de saúde",
  "resumo": "Ações de saúde baseadas em evidências e um time de saúde dedicado, com foco em prevenção, redução de custos e qualidade de vida.",
  "pontos": "Perfil de Saúde Copplasa: mapeamento dos fatores de risco da população\nSaúde mental em foco com o Copplasa Cuida"
 },
 {
  "id": "s4",
  "grupo": "Soluções corporativas",
  "nome": "Gestão de riscos",
  "resumo": "Estudos atuariais e análise de dados para alinhar a política de benefícios ao perfil da empresa e otimizar o investimento.",
  "pontos": "Análise de mercado inteligente\nNegociação estratégica\nGestão transparente de informações"
 },
 {
  "id": "s5",
  "grupo": "Soluções corporativas",
  "nome": "Seguros empresariais",
  "resumo": "Seguros sob medida para proteger a empresa, o patrimônio e os colaboradores, com avaliação técnica e atendimento especializado.",
  "pontos": "Linhas financeiras e responsabilidade civil\nSeguro corporativo e de transportes"
 },
 {
  "id": "s6",
  "grupo": "Soluções corporativas",
  "nome": "Programa Worksite",
  "resumo": "Contratação de seguros pessoais com condições diferenciadas para o time: vida, viagem, carro, moto, aparelhos portáteis e mais.",
  "pontos": "Personalizado para a empresa e os colaboradores\nAgrega mais valor ao pacote de benefícios"
 },
 {
  "id": "s7",
  "grupo": "Famílias e PME",
  "nome": "Seguros pessoais",
  "resumo": "Plano de saúde, plano odontológico, seguro de vida, seguro viagem e seguro pet sob medida para você, sua família e sua empresa.",
  "pontos": "Atendimento ágil e personalizado\nSoluções também para pequenas e médias empresas"
 },
 {
  "id": "s8",
  "grupo": "Famílias e PME",
  "nome": "Seguros patrimoniais",
  "resumo": "Proteção para casa, condomínio, carro, moto e aparelhos portáteis, com suporte completo em qualquer imprevisto.",
  "pontos": "Seguro residencial e condomínio\nSeguro auto e moto\nSeguro de aparelhos portáteis"
 },
 {
  "id": "s9",
  "grupo": "Famílias e PME",
  "nome": "Saúde internacional",
  "resumo": "Seguro saúde com atendimento no Brasil e no exterior, liberdade para escolher médicos e hospitais e alto padrão de reembolso.",
  "pontos": "Você escolhe o plano e a franquia\nO seguro reembolsa as despesas de consultas, tratamentos e medicamentos prescritos"
 }
]$j$::jsonb)
where id = 1
  and dados->'produtos' = $j$[{"id": "p1", "grupo": "Saúde e benefícios", "nome": "Plano de saúde empresarial", "resumo": "Assistência médica e hospitalar para colaboradores e dependentes, para empresas de todos os portes, inclusive PME.", "pontos": "Abrangência regional ou nacional, conforme a rede escolhida\nPode ter coparticipação, que reduz a mensalidade\nCom 30 ou mais vidas, quem entra em até 30 dias não cumpre carência"}, {"id": "p2", "grupo": "Saúde e benefícios", "nome": "Plano odontológico", "resumo": "Consultas, limpeza, restaurações, tratamento de canal e outros procedimentos previstos no rol da ANS.", "pontos": "Mensalidade bem menor que a do plano médico\nPode ser contratado junto com o plano de saúde ou separado"}, {"id": "p3", "grupo": "Saúde e benefícios", "nome": "Seguro de vida em grupo", "resumo": "Indenização aos beneficiários em caso de morte e, conforme as coberturas contratadas, de invalidez por acidente ou doença.", "pontos": "Coberturas adicionais comuns: auxílio-funeral e diárias por incapacidade\nMuitas convenções coletivas exigem o seguro para os colaboradores"}, {"id": "p4", "grupo": "Outros seguros", "nome": "Seguro auto", "resumo": "Proteção contra roubo, furto, colisão e danos a terceiros, com assistência 24 horas conforme a apólice.", "pontos": "A franquia escolhida muda o preço e o valor pago em sinistros parciais\nA classe de bônus reduz o preço na renovação"}, {"id": "p5", "grupo": "Outros seguros", "nome": "Seguro residencial", "resumo": "Cobertura básica para incêndio, queda de raio e explosão, com opções como danos elétricos, roubo e responsabilidade civil.", "pontos": "Costuma incluir assistências como chaveiro, encanador e eletricista\nVale para casa ou apartamento, próprio ou alugado"}, {"id": "p6", "grupo": "Outros seguros", "nome": "Seguro pet", "resumo": "Planos para cães e gatos com consultas, vacinas, exames e atendimento de emergência, conforme o plano escolhido.", "pontos": "Pode haver carência para alguns procedimentos\nA idade máxima para contratação varia de empresa para empresa"}]$j$::jsonb;

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
