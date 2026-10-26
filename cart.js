import{supabase,money,escapeHTML,toast,showLoader,hideLoader}from'./supabaseClient.js';
export async function addToCart(p,size,quantity=1,notes=''){showLoader('Atualizando carrinho…');try{const{data:{user}}=await supabase.auth.getUser();if(!user){const{showLogin}=await import('./userProfile.js');showLogin();return false}if(!Number.isInteger(quantity)||quantity<1||quantity>20){toast('Quantidade inválida');return false}const{error}=await supabase.from('cart_items').upsert({user_id:user.id,product_id:p.id,size,quantity,item_notes:notes},{onConflict:'user_id,product_id,size,item_notes'});if(error){toast('Não foi possível adicionar ao carrinho');return false}toast('Produto adicionado ao carrinho com sucesso.');const{refreshCartCount}=await import('./home.js');refreshCartCount();return true}finally{hideLoader()}}
export async function renderCart(el){
  const{data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user){el.innerHTML='<h2>Carrinho</h2><p>Entre para visualizar e comprar seus itens.</p><button id="login" class="primary">Entrar</button>';el.querySelector('#login').onclick=async()=>{const{showLogin}=await import('./userProfile.js');showLogin()};return}
  const{data,error}=await supabase.from('cart_items').select('id,product_id,size,quantity,item_notes,products(name,price_cents,image_url)').eq('user_id',user.id).order('created_at',{ascending:false});
  if(error){el.innerHTML='<h2>Carrinho</h2><p class="muted">Falha ao carregar o carrinho.</p><button id="retry-cart" class="secondary">Tentar novamente</button>';el.querySelector('#retry-cart').onclick=()=>renderCart(el);return}
  if(!data?.length){el.innerHTML='<h2>Carrinho</h2><p>Seu carrinho está vazio.</p>';return}
  const total=data.reduce((s,r)=>s+(r.products?.price_cents||0)*r.quantity,0);
  el.innerHTML='<h2>Carrinho</h2><div class="cart-items">'+data.map(r=>'<article class="cart-row cart-item" data-cart-row="'+escapeHTML(r.id)+'">'+(r.products?.image_url?'<img src="'+escapeHTML(r.products.image_url)+'" alt="">':'')+'<div class="cart-item-info"><b>'+escapeHTML(r.products?.name||'Produto')+'</b><p>Tamanho '+escapeHTML(r.size)+'</p><div class="cart-quantity"><button type="button" data-quantity-delta="-1" data-id="'+escapeHTML(r.id)+'" '+(r.quantity<=1?'disabled':'')+' aria-label="Diminuir quantidade" title="Diminuir"><i class="fa-solid fa-minus"></i></button><span data-quantity-value>'+r.quantity+'</span><button type="button" data-quantity-delta="1" data-id="'+escapeHTML(r.id)+'" '+(r.quantity>=20?'disabled':'')+' aria-label="Aumentar quantidade" title="Aumentar"><i class="fa-solid fa-plus"></i></button><span class="cart-quantity-status" aria-live="polite"></span></div><p class="cart-item-price">'+money((r.products?.price_cents||0)*r.quantity)+'</p>'+(r.item_notes?'<p class="muted">'+escapeHTML(r.item_notes)+'</p>':'')+'</div><button type="button" data-remove="'+escapeHTML(r.id)+'" class="cart-remove" aria-label="Remover produto" title="Remover"><i class="fa-regular fa-trash-can"></i></button></article>').join('')+'</div><div class="cart-total"><h3>Subtotal '+money(total)+'</h3><button id="checkout" class="primary">Comprar</button></div>';
  el.querySelectorAll('[data-quantity-delta]').forEach(btn=>btn.onclick=async()=>{
    const row=btn.closest('[data-cart-row]'),id=btn.dataset.id,quantityNow=Number(row.querySelector('[data-quantity-value]').textContent),next=quantityNow+Number(btn.dataset.quantityDelta);
    if(!Number.isInteger(next)||next<1||next>20)return;
    const buttons=row.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);row.querySelector('.cart-quantity-status').textContent='Salvando…';
    showLoader('Atualizando quantidade…');
    try{
      const{error}=await supabase.from('cart_items').update({quantity:next}).eq('id',id).eq('user_id',user.id);
      if(error)throw error;
      await renderCart(el);
    }catch(e){toast('Não foi possível atualizar a quantidade. Tente novamente.');buttons.forEach(b=>b.disabled=false);row.querySelector('.cart-quantity-status').textContent='';console.error('Erro ao atualizar quantidade do carrinho:',e)}
    finally{hideLoader()}
  });
  el.querySelectorAll('[data-remove]').forEach(btn=>btn.onclick=async()=>{
    const row=btn.closest('[data-cart-row]');row.querySelectorAll('button').forEach(b=>b.disabled=true);showLoader('Removendo item…');
    try{const{error}=await supabase.from('cart_items').delete().eq('id',btn.dataset.remove).eq('user_id',user.id);if(error)throw error;toast('Produto removido do carrinho.');await renderCart(el)}
    catch(e){toast('Não foi possível remover o produto. Tente novamente.');row.querySelectorAll('button').forEach(b=>b.disabled=false);console.error('Erro ao remover do carrinho:',e)}
    finally{hideLoader()}
  });
  el.querySelector('#checkout').onclick=async()=>{
    const button=el.querySelector('#checkout');button.disabled=true;
    try{await startCheckout(el)}catch(e){toast('Não foi possível abrir o checkout. Tente novamente.');console.error('Erro ao iniciar checkout:',e);button.disabled=false}
  };
}
export async function startCheckout(el){
  const{data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user){const{showLogin}=await import('./userProfile.js');showLogin();return}
  showLoader('Preparando o checkout…');
  let profile,cart;
  try{
    const[profileResult,cartResult]=await Promise.all([
      supabase.from('profiles').select('*').eq('user_id',user.id).maybeSingle(),
      supabase.from('cart_items').select('id,quantity,size,item_notes,products(name,price_cents)').eq('user_id',user.id)
    ]);
    if(profileResult.error)throw profileResult.error;
    if(cartResult.error)throw cartResult.error;
    profile=profileResult.data;cart=cartResult.data;
  }catch(e){toast('Não foi possível carregar os dados do checkout. Verifique sua conexão e tente novamente.');console.error('Erro ao preparar checkout:',e);return}
  finally{hideLoader()}
  if(!cart?.length){toast('O carrinho está vazio.');await renderCart(el);return}
  const subtotal=cart.reduce((s,x)=>s+(x.products?.price_cents||0)*x.quantity,0),summary=cart.map(x=>x.quantity+'x '+x.products?.name+' ('+x.size+')').join(', ');
  el.innerHTML='<h2>Finalizar pedido</h2><p>'+escapeHTML(summary)+'</p><p>Subtotal dos produtos: <b>'+money(subtotal)+'</b></p><form id="checkout-form"><label class="field">Como deseja receber?<select id="fulfillment" name="fulfillment_method"><option value="delivery">Entrega</option><option value="pickup">Retirada</option></select></label><div id="address-fields">'+[['street','Rua',profile?.address_line||'','text'],['number','Número',profile?.address_number||'','text'],['complement','Complemento',profile?.address_complement||'','text'],['neighborhood','Bairro',profile?.neighborhood||'','text'],['city','Cidade',profile?.city||'','text'],['state','Estado (UF)',profile?.state||'RN','text'],['postal_code','CEP',profile?.postal_code||'','text']].map(([n,l,v,t])=>'<div class="field"><label for="checkout-'+n+'">'+l+'</label><input id="checkout-'+n+'" name="'+n+'" type="'+t+'" '+(n==='state'?'maxlength="2"':'')+' '+(n==='complement'?'':'required')+' value="'+escapeHTML(v)+'"></div>').join('')+'</div><div class="field"><label for="customer-notes">Observações do pedido</label><textarea id="customer-notes" name="customer_notes" rows="3"></textarea></div><div id="shipping-result" class="muted" role="status">Informe o endereço e calcule o frete.</div><div class="checkout-buttons"><button id="quote" type="button" class="secondary">Calcular frete</button><button type="submit" class="primary">Ir para pagamento</button><button id="back-cart" type="button" class="secondary">Voltar ao carrinho</button></div></form>';
  let estimateId=null;
  const form=el.querySelector('#checkout-form'),addressFields=el.querySelector('#address-fields'),result=el.querySelector('#shipping-result'),fulfillment=el.querySelector('#fulfillment'),quoteButton=el.querySelector('#quote'),submitButton=form.querySelector('button[type="submit"]');
  function setMethod(){const delivery=fulfillment.value==='delivery';addressFields.hidden=!delivery;addressFields.querySelectorAll('input').forEach(i=>i.required=delivery&&i.name!=='complement');result.textContent=delivery?'Informe o endereço e calcule o frete.':'Retirada selecionada: não será cobrado frete.';estimateId=null;quoteButton.hidden=!delivery}
  fulfillment.onchange=setMethod;setMethod();
  el.querySelector('#back-cart').onclick=()=>renderCart(el);
  async function getInvokeError(error){
    let info={};
    try{if(error?.context?.json)info=await error.context.json()}catch{}
    return info;
  }
  quoteButton.onclick=async()=>{
    if(fulfillment.value!=='delivery'){result.textContent='Na retirada não há frete.';return}
    const f=new FormData(form),address={street:f.get('street'),number:f.get('number'),complement:f.get('complement'),neighborhood:f.get('neighborhood'),city:f.get('city'),state:f.get('state'),postal_code:f.get('postal_code')};
    if(!address.street||!address.number||!address.neighborhood||!address.city||!address.state||!address.postal_code){result.textContent='Preencha rua, número, bairro, cidade, estado e CEP antes de calcular o frete.';return}
    quoteButton.disabled=true;submitButton.disabled=true;result.textContent='Calculando frete fixo…';showLoader('Calculando frete…');
    try{
      const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
      const city=norm(address.city),state=norm(address.state),neighborhood=norm(address.neighborhood);
      const waText='Olá! Gostaria de consultar a entrega para meu pedido: '+summary+'. Endereço: '+Object.values(address).filter(Boolean).join(', ');
      const whatsapp='<a class="primary" target="_blank" rel="noopener" href="https://wa.me/5584920039738?text='+encodeURIComponent(waText)+'">Consultar pelo WhatsApp</a>';
      let fee=null,reason='';
      if(state!=='rn') reason='Por enquanto, entregas fora do Rio Grande do Norte precisam ser combinadas com o vendedor.';
      else if(city==='ceara-mirim'){
        const fixed={'barretao':800,'santa paula':800,'gravata':1000,'mangabeira':1000,'primavera':1000,'centro':600,'planalto':600,'nova descoberta':600,'nova conquista':600,'novo horizonte':600,'vale do amanhecer':600,'verde vale':600,'cohab':600,'sao geraldo':600,'santa agueda':600,'passifica':600};
        if(Object.prototype.hasOwnProperty.call(fixed,neighborhood))fee=fixed[neighborhood];else reason='Esse bairro de Ceará-Mirim não está na lista de entrega automática.';
      }else if(city==='joao camara')fee=600;
      else if(city==='sao goncalo do amarante'){if(neighborhood==='jardim lola')fee=1600;else reason='Em São Gonçalo do Amarante, a entrega automática é somente no bairro Jardim Lola.';}
      else if(city==='natal'){if(['nordeste','quintas','nazare','lagoa nova'].includes(neighborhood))fee=1600;else reason='Em Natal, a entrega automática está disponível somente nos bairros Nordeste, Quintas, Nazaré e Lagoa Nova.';}
      else reason='Sua cidade precisa ser confirmada com o vendedor.';
      estimateId=null;
      if(fee===null){result.innerHTML='<p>'+escapeHTML(reason)+' Entre em contato para combinar a entrega.</p>'+whatsapp;return;}
      result.textContent='Frete fixo: '+money(fee)+'. Total estimado: '+money(subtotal+fee)+'.';
      estimateId='fixed:'+fee;
    }catch(e){result.textContent='Não foi possível calcular o frete. Confira o endereço e tente novamente.';estimateId=null;console.error('Erro ao calcular frete fixo:',e)}
    finally{hideLoader();quoteButton.disabled=false;submitButton.disabled=false}
    }catch(e){result.textContent='Não foi possível conectar à Uber Direct. Verifique a conexão e tente novamente.';estimateId=null;console.error('Erro de rede ao calcular frete:',e)}
    finally{hideLoader();quoteButton.disabled=false;submitButton.disabled=false}
  };
  form.onsubmit=async e=>{
    e.preventDefault();
    if(fulfillment.value==='delivery'&&!estimateId){result.textContent='Calcule o frete primeiro. Se a região precisar de consulta, fale com o vendedor pelo WhatsApp.';return}
    const f=new FormData(form),method=f.get('fulfillment_method'),address={street:f.get('street'),number:f.get('number'),complement:f.get('complement'),neighborhood:f.get('neighborhood'),city:f.get('city'),state:String(f.get('state')||'').toUpperCase(),postal_code:f.get('postal_code')};
    submitButton.disabled=true;quoteButton.disabled=true;result.textContent='Criando pedido e checkout seguro…';showLoader('Preparando pagamento pela InfinitePay…');
    try{
      const{data,error}=await supabase.functions.invoke('create-checkout',{body:{fulfillment_method:method,address,estimate_id:estimateId,customer_notes:f.get('customer_notes')}});
      if(error){const info=await getInvokeError(error);result.textContent=info.message||info.error||'A InfinitePay não conseguiu criar o link de pagamento. Confira a configuração das credenciais e tente novamente.';return}
      if(!data?.checkout_url){result.textContent='A resposta do checkout não contém um link válido. Nenhum redirecionamento foi realizado.';return}
      result.textContent='Pedido criado. Abrindo o pagamento seguro…';toast('Redirecionando para o pagamento seguro…');location.href=data.checkout_url;
    }catch(e){result.textContent='Não foi possível iniciar o pagamento. Verifique a conexão e tente novamente.';console.error('Erro ao criar checkout:',e)}
    finally{hideLoader();submitButton.disabled=false;quoteButton.disabled=false}
  };
}
