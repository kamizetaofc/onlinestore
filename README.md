# Kamizeta

Loja estática em HTML, CSS e JavaScript integrada ao Supabase. O site público é hospedado no GitHub Pages; autenticação, banco e Edge Functions continuam no Supabase.

## Publicação no GitHub Pages

1. No GitHub, abra **Settings → Pages** deste repositório.
2. Em **Build and deployment**, selecione **GitHub Actions** como fonte.
3. O workflow `.github/workflows/deploy-pages.yml` publica automaticamente a branch `main`.
4. Endereço esperado: https://kamizetaofc.github.io/onlinestore/

O workflow monta somente os arquivos necessários para o site; ele não publica as migrações SQL nem o código das Edge Functions.

## Logomarca e favicon

- Faça upload do arquivo da logomarca na **raiz do repositório** (mesmo nível de `index.html`), com o nome exato **`kamizeta.png`**.
- O arquivo será usado automaticamente como logo da loja e favicon do site e do painel administrativo.
- O workflow copia a imagem quando ela existir; depois do upload, um novo deploy do GitHub Pages será iniciado.

## Supabase

- A URL do projeto e a chave publishable ficam em `supabaseClient.js`. A chave publishable pode ser pública; nunca coloque chaves secretas ou `service_role` no frontend.
- Em **Authentication → URL Configuration**, configure o **Site URL** para `https://kamizetaofc.github.io/onlinestore/` e inclua também essa URL nas **Redirect URLs** permitidas. Esse ajuste ainda precisa ser salvo no painel do Supabase.
- A Edge Function `create-checkout` já usa como destino de pagamento `https://kamizetaofc.github.io/onlinestore/pagamento-concluido.html?order_nsu=...`.
- Configure os secrets `INFINITEPAY_API_KEY`, `INFINITEPAY_WEBHOOK_TOKEN` e `GOOGLE_SERVICE_ACCOUNT_JSON` no Supabase; não os publique no GitHub.
- A galeria de imagens já aponta para a pasta do Drive com ID `1BsaXcKyWzaUHVB5l44qNRIDNs6b4VWCq`. A Edge Function ainda precisa do secret `GOOGLE_SERVICE_ACCOUNT_JSON` com uma conta de serviço autorizada a acessar a pasta.
- **Segurança do Drive:** não deixe “qualquer pessoa com o link” como **Editor**. Use **Leitor** para o acesso público às imagens e compartilhe a pasta separadamente com o e-mail da conta de serviço, concedendo a ela apenas a permissão necessária.
- Conceda `app_metadata.role = admin` à conta administrativa por um procedimento seguro no servidor.

## Antes de considerar a loja pronta para produção

- Adicione `kamizeta.png` à raiz do repositório.
- Confirme as URLs de autenticação no painel do Supabase e publique o site via GitHub Pages.
- Teste a galeria do Drive, cotação Uber, checkout InfinitePay e webhook com credenciais reais.
- Verifique no Supabase as políticas RLS e os URLs de autenticação após a publicação.

Checkout, entrega e pagamentos externos não devem ser considerados validados até a execução dos testes reais.
