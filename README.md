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

## 2. Ativar a área de relatórios

No **SQL Editor**, cole e rode [`supabase/relatorios.sql`](supabase/relatorios.sql). Ele cria:

- o cadastro de empresas clientes e o vínculo de cada login (equipe ou cliente de uma empresa);
- a lista de relatórios e um bucket privado `relatorios` para os arquivos.

Regras: a equipe Copplasa (e quem é editor) vê todos os relatórios; um cliente vê só os da própria empresa; relatório marcado como "Somente equipe" nunca aparece para clientes. O arquivo só é entregue a quem pode ver o relatório.

Pelo site, quem é editor:

- **Publicar relatório:** envia o arquivo `.html` do relatório e escolhe quem pode ver.
- **Editar:** muda título, descrição, quem vê, ou substitui o arquivo por uma versão nova.
- **Acessos:** cadastra empresas clientes e define, para cada login, se é da equipe, cliente de qual empresa, ou só vê o portal.

Os relatórios abrem dentro do site, isolados da sessão de login, com gráficos, filtros e downloads funcionando.

## 3. Publicar no GitHub Pages

1. Envie estes arquivos para um repositório no GitHub (ex.: `portal-copplasa`).
2. Em **Settings > Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Em alguns minutos o site fica no ar em `https://<usuario>.github.io/portal-copplasa/`.

No plano gratuito do GitHub, o repositório precisa ser público para usar o Pages. Isso expõe só o código; o conteúdo e os usuários ficam no Supabase, protegidos por login.

## 4. Cadastrar pessoas

- **Criar acesso:** Supabase > **Authentication > Users > Add user > Create new user**. Informe e-mail e senha e marque **Auto Confirm User**. Passe a senha à pessoa por um canal seguro; ela pode trocá-la em "Alterar senha" depois de entrar.
- **Definir o que a pessoa vê:** no site, botão **Acessos** (equipe, cliente de uma empresa ou só o portal).
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
| `supabase/relatorios.sql` | Empresas, acessos, relatórios e bucket privado dos arquivos |
| `supabase/tornar-editor.sql` | Dá permissão de edição a uma pessoa |
