# Portal Copplasa

Site de informações da Copplasa Corretora de Seguros para clientes, parceiros e equipe, com acesso por e-mail e senha.

- **Hospedagem:** GitHub Pages (gratuita, endereço `https://<usuario>.github.io/portal-copplasa/`, sem precisar de domínio).
- **Login e conteúdo:** Supabase. O conteúdo fica no banco de dados e só é entregue a quem está logado; o código do site não contém o conteúdo.
- **Edição:** pessoas marcadas como editoras veem o botão "Editar conteúdo" e publicam alterações pelo próprio site.

## 1. Configurar o Supabase

1. Crie um projeto em https://supabase.com/dashboard (região sugerida: São Paulo).
2. Abra **SQL Editor**, cole o arquivo [`supabase/setup.sql`](supabase/setup.sql) inteiro e clique em **Run**. Ele cria as tabelas, as regras de acesso e o conteúdo inicial.
3. Em **Authentication**:
   - Desative o cadastro aberto ("Allow new users to sign up" desligado). Assim só entra quem a Copplasa cadastrar.
   - Em **URL Configuration**, coloque o endereço do site em **Site URL** e também em **Redirect URLs**.
   - Recomendado: senha mínima de 8 caracteres.
4. Em **Project Settings > API**, copie a **Project URL** e a chave **anon / publishable** e cole em [`config.js`](config.js).
   Nunca use a chave `service_role` / `secret` no site.

## 2. Publicar no GitHub Pages

1. Envie estes arquivos para um repositório no GitHub (ex.: `portal-copplasa`).
2. Em **Settings > Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Em alguns minutos o site fica no ar em `https://<usuario>.github.io/portal-copplasa/`.

No plano gratuito do GitHub, o repositório precisa ser público para usar o Pages. Isso expõe só o código; o conteúdo e os usuários ficam no Supabase, protegidos por login.

## 3. Cadastrar pessoas

- **Criar acesso:** Supabase > **Authentication > Users > Add user > Create new user**. Informe e-mail e senha e marque **Auto Confirm User**. Passe a senha à pessoa por um canal seguro; ela pode trocá-la em "Alterar senha" depois de entrar.
- **Dar permissão de edição:** rode [`supabase/tornar-editor.sql`](supabase/tornar-editor.sql) no SQL Editor com o e-mail da pessoa.
- **Bloquear ou remover acesso:** em **Authentication > Users**, apague o usuário.

## Limitações do plano gratuito

- O Supabase pausa projetos gratuitos depois de cerca de uma semana sem uso. Para reativar, clique em **Restore** no painel. O plano pago não pausa.
- Sem um servidor de e-mail próprio, o Supabase só envia e-mails (como "Esqueci minha senha") para membros da equipe do projeto, e com limite por hora. Para clientes recuperarem a senha sozinhos, configure um SMTP em **Authentication > Emails > SMTP Settings** (por exemplo, a conta de e-mail corporativa). Sem isso, a Copplasa redefine a senha pelo painel.

## Ao alterar o código

O GitHub Pages deixa o navegador guardar os arquivos por até 10 minutos. Ao mudar `config.js`, `assets/app.js` ou `assets/styles.css`, aumente o número `?v=` desses arquivos em `index.html` para que todos recebam a versão nova.

## Arquivos

| Arquivo | Para que serve |
| --- | --- |
| `index.html` | Telas de login e do portal |
| `assets/app.js` | Login, leitura do conteúdo e editor |
| `assets/styles.css` | Visual do site |
| `assets/vendor/` | Biblioteca oficial do Supabase (`@supabase/supabase-js` 2.45.4) |
| `config.js` | Endereço e chave pública do projeto Supabase |
| `supabase/setup.sql` | Tabelas, regras de acesso e conteúdo inicial |
| `supabase/tornar-editor.sql` | Dá permissão de edição a uma pessoa |
