# Kamizeta

Loja estática em HTML, CSS e JavaScript integrada ao Supabase. O site público está hospedado no Vercel em https://kamizeta.vercel.app; autenticação, banco e Edge Functions continuam no Supabase.

## Publicação no Vercel

O projeto `kamizetaofc/onlinestore` está conectado ao Vercel. A branch `main` é publicada automaticamente no domínio https://kamizeta.vercel.app.

## Logomarca e favicon

- Faça upload do arquivo da logomarca na **raiz do repositório** (mesmo nível de `index.html`), com o nome exato **`kamizeta.png`**.
- O arquivo será usado automaticamente como logo da loja e favicon do site e do painel administrativo.
- Ao adicionar ou atualizar a imagem na raiz do repositório, o Vercel publica a nova versão automaticamente.

## Supabase

- A URL do projeto e a chave publishable ficam em `supabaseClient.js`. A chave publishable pode ser pública; nunca coloque chaves secretas ou `service_role` no frontend.
- Em **Authentication → URL Configuration**, configure o **Site URL** para `https://kamizeta.vercel.app` e inclua `https://kamizeta.vercel.app/**` nas **Redirect URLs** permitidas. Esse ajuste ainda precisa ser salvo no painel do Supabase.
- A Edge Function `create-checkout` já usa como destino de pagamento `https://kamizeta.vercel.app/pagamento-concluido.html?order_nsu=...`.
- Configure os secrets `INFINITEPAY_API_KEY`, `INFINITEPAY_WEBHOOK_TOKEN` e `GOOGLE_SERVICE_ACCOUNT_JSON` no Supabase; não os publique no GitHub.
- A galeria de imagens já aponta para a pasta do Drive com ID `1BsaXcKyWzaUHVB5l44qNRIDNs6b4VWCq`. A Edge Function ainda precisa do secret `GOOGLE_SERVICE_ACCOUNT_JSON` com uma conta de serviço autorizada a acessar a pasta.
- **Segurança do Drive:** não deixe “qualquer pessoa com o link” como **Editor**. Use **Leitor** para o acesso público às imagens e compartilhe a pasta separadamente com o e-mail da conta de serviço, concedendo a ela apenas a permissão necessária.
- Conceda `app_metadata.role = admin` à conta administrativa por um procedimento seguro no servidor.

## Antes de considerar a loja pronta para produção

- Adicione `kamizeta.png` à raiz do repositório.
- Confirme as URLs de autenticação no painel do Supabase e confirme a publicação no Vercel.
- Teste a galeria do Drive, frete fixo, checkout InfinitePay e webhook com credenciais reais.
- Verifique no Supabase as políticas RLS e os URLs de autenticação após a publicação.

Checkout, entrega e pagamentos externos não devem ser considerados validados até a execução dos testes reais.
