-- Registra o login do robô que atualiza os relatórios automaticamente.
-- Troque o e-mail abaixo pelo e-mail do robô e rode no "SQL Editor" do Supabase.
-- Rode depois de relatorios.sql.
insert into public.portal_robos (user_id)
select id from auth.users where email = lower('EMAIL_DO_ROBO@copplasa.com.br')
on conflict (user_id) do nothing;

-- Confere quem está registrado como robô:
select u.email from public.portal_robos r join auth.users u on u.id = r.user_id;
