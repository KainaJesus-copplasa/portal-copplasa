-- Dá permissão de edição do portal a uma pessoa que já tem login.
-- Troque o e-mail abaixo e rode no "SQL Editor" do Supabase.
insert into public.portal_editores (user_id)
select id from auth.users where email = lower('EMAIL_DA_PESSOA@copplasa.com.br')
on conflict (user_id) do nothing;

-- Para conferir quem pode editar:
-- select u.email from public.portal_editores e join auth.users u on u.id = e.user_id;

-- Para tirar a permissão:
-- delete from public.portal_editores
-- where user_id = (select id from auth.users where email = lower('EMAIL_DA_PESSOA@copplasa.com.br'));
