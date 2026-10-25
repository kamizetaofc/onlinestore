# Kamizeta

Loja estática em HTML, CSS e JavaScript integrada ao Supabase. O site público é hospedado no GitHub Pages; autenticação, banco e Edge Functions continuam no Supabase.

## Publicação no GitHub Pages

1. No GitHub, abra **Settings → Pages** deste repositório.
2. Em **Build and deployment**, selecione **GitHub Actions** como fonte.
3. O workflow `.github/workflows/deploy-pages.yml` publica automaticamente a branch `main`.
4. Endereço esperado: https://kamizetaofc.github.io/onlinestore/

O workflow monta somente os arquivos necessários para o site; ele não publica as migrações SQL nem o código das Edge Functions.

## Configuração necessária no Supabase

- Confirme a URL do projeto e a chave publishable em `supabaseClient.js`. A chave publishable pode ser pública; nunca coloque chaves secretas ou `service_role` no frontend.
- Em **Authentication → URL Configuration**, configure o Site URL para `https://kamizetaofc.github.io/onlinestore/` e inclua esse endereço nas Redirect URLs permitidas.
- Atualize o secret `SITE_URL` das Edge Functions para `https://kamizetaofc.github.io/onlinestore/`.
- Configure os secrets de Google Drive, Uber e InfinitePay no Supabase; não os publique no GitHub.
- Conceda `app_metadata.role = admin` à conta administrativa por um procedimento seguro no servidor.

## Antes de considerar a loja pronta para produção

- Adicione o arquivo real `kamizeta.png` à raiz do repositório. Até lá, a interface usa o fallback visual.
- Teste a galeria do Drive, cotação Uber, checkout InfinitePay e webhook com credenciais reais.
- Verifique no Supabase as políticas RLS e os URLs de autenticação após a publicação.

Checkout, entrega e pagamentos externos não devem ser considerados validados até a execução dos testes reais.
