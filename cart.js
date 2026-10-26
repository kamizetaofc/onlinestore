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

  const subtotal=cart.reduce((sum,item)=>sum+(item.products?.price_cents||0)*item.quantity,0);
  const summary=cart.map(item=>item.quantity+'x '+item.products?.name+' ('+item.size+')').join(', ');
  const stateOptions=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RS','RO','RR','SC','SP','SE','TO'];
  const cityOptions=['Ceará-Mirim','João Câmara','São Gonçalo do Amarante','Natal'];
  const neighborhoodOptions={
    'ceara mirim':['Barretão','Santa Paula','Gravatá','Mangabeira','Primavera','Centro','Planalto','Nova Descoberta','Nova Conquista','Novo Horizonte','Vale do Amanhecer','Verde Vale','Cohab','São Geraldo','Santa Águeda','Passifica'],
    'sao goncalo do amarante':['Jardim Lola'],
    'natal':['Nordeste','Quintas','Nazaré','Lagoa Nova']
  };
  const neighborhoodFees={
    'barretao':800,'santa paula':800,'gravata':1000,'mangabeira':1000,'primavera':1000,
    'centro':600,'planalto':600,'nova descoberta':600,'nova conquista':600,'novo horizonte':600,
    'vale do amanhecer':600,'verde vale':600,'cohab':600,'sao geraldo':600,'santa agueda':600,'passifica':600
  };

  el.innerHTML='<h2>Finalizar pedido</h2><p>'+escapeHTML(summary)+'</p><p>Subtotal dos produtos: <b>'+money(subtotal)+'</b></p><form id="checkout-form"><label class="field">Como deseja receber?<select id="fulfillment" name="fulfillment_method"><option value="delivery">Entrega</option><option value="pickup">Retirada</option></select></label><div id="address-fields">'+
    [['street','Rua',profile?.address_line||'','text'],['number','Número',profile?.address_number||'','text'],['complement','Complemento',profile?.address_complement||'','text']].map(([name,label,value,type])=>'<div class="field"><label for="checkout-'+name+'">'+label+'</label><input id="checkout-'+name+'" name="'+name+'" type="'+type+'" value="'+escapeHTML(value)+'" '+(name==='complement'?'':'required')+'></div>').join('')+
    '<div class="field"><label for="checkout-neighborhood">Bairro</label><input id="checkout-neighborhood" name="neighborhood" type="text" list="checkout-neighborhood-options" autocomplete="address-level3" value="'+escapeHTML(profile?.neighborhood||'')+'" required><datalist id="checkout-neighborhood-options"></datalist></div>'+
    '<div class="field"><label for="checkout-city">Cidade</label><input id="checkout-city" name="city" type="text" list="checkout-city-options" autocomplete="address-level2" value="'+escapeHTML(profile?.city||'')+'" required><datalist id="checkout-city-options"></datalist></div>'+
    '<div class="field"><label for="checkout-state">Estado (UF)</label><select id="checkout-state" name="state" autocomplete="address-level1" required><option value="">Selecione a UF</option>'+stateOptions.map(state=>'<option value="'+state+'">'+state+'</option>').join('')+'</select></div>'+
    '<div class="field"><label for="checkout-postal_code">CEP</label><input id="checkout-postal_code" name="postal_code" type="text" autocomplete="postal-code" value="'+escapeHTML(profile?.postal_code||'')+'" required></div>'+
    '</div><div class="field"><label for="customer-notes">Observações do pedido</label><textarea id="customer-notes" name="customer_notes" rows="3"></textarea></div><p id="shipping-suggestion" class="form-feedback" role="status" hidden></p><div id="shipping-result" class="muted" role="status">Selecione a UF, cidade e bairro para calcular o frete automaticamente.</div><div class="checkout-buttons"><button id="quote" type="button" class="secondary">Recalcular frete</button><button type="submit" class="primary">Ir para pagamento</button><button id="back-cart" type="button" class="secondary">Voltar ao carrinho</button></div></form>';

  const form=el.querySelector('#checkout-form');
  const addressFields=el.querySelector('#address-fields');
  const result=el.querySelector('#shipping-result');
  const suggestionBox=el.querySelector('#shipping-suggestion');
  const fulfillment=el.querySelector('#fulfillment');
  const quoteButton=el.querySelector('#quote');
  const submitButton=form.querySelector('button[type="submit"]');
  const stateField=form.elements.state;
  const cityField=form.elements.city;
  const neighborhoodField=form.elements.neighborhood;
  const cityList=form.querySelector('#checkout-city-options');
  const neighborhoodList=form.querySelector('#checkout-neighborhood-options');
  let shippingCalculated=false;

  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[-_]+/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ');
  function editDistance(a,b){
    const rows=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      let diagonal=rows[0];rows[0]=i;
      for(let j=1;j<=b.length;j++){
        const old=rows[j];
        rows[j]=Math.min(rows[j]+1,rows[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));
        diagonal=old;
      }
    }
    return rows[b.length];
  }
  function nearMatch(value,candidates){
    const normalized=normalize(value);
    if(normalized.length<4||!candidates.length)return null;
    if(candidates.some(candidate=>normalize(candidate)===normalized))return null;
    const matches=candidates.map(candidate=>({candidate,distance:editDistance(normalized,normalize(candidate))}))
      .sort((a,b)=>a.distance-b.distance);
    const best=matches[0];
    const maxDistance=normalized.length>=8?2:1;
    if(!best||best.distance<1||best.distance>maxDistance)return null;
    if(matches[1]&&matches[1].distance===best.distance)return null;
    return best.candidate;
  }
  function exactCanonical(value,candidates){
    const normalized=normalize(value);
    return candidates.find(candidate=>normalize(candidate)===normalized)||null;
  }
  function clearSuggestion(){
    suggestionBox.hidden=true;
    suggestionBox.innerHTML='';
  }
  function showSuggestion(field,label,correctValue){
    suggestionBox.hidden=false;
    suggestionBox.className='form-feedback shipping-suggestion';
    suggestionBox.innerHTML='Você quis dizer <b>'+escapeHTML(correctValue)+'</b>? <button type="button" class="secondary" id="accept-shipping-suggestion">Usar '+escapeHTML(correctValue)+'</button>';
    suggestionBox.querySelector('#accept-shipping-suggestion').onclick=()=>{
      field.value=correctValue;
      clearSuggestion();
      updateAddressOptions();
      calculateShipping();
      field.focus();
    };
    result.textContent=label==='city'?'Confirme a cidade sugerida para calcular o frete.':'Confirme o bairro sugerido para calcular o frete.';
    shippingCalculated=false;
  }
  function updateAddressOptions(){
    const inRN=stateField.value==='RN';
    cityList.innerHTML=inRN?cityOptions.map(city=>'<option value="'+escapeHTML(city)+'">').join(''):'';
    const cityKey=normalize(cityField.value);
    const available=neighborhoodOptions[cityKey]||[];
    neighborhoodList.innerHTML=available.map(name=>'<option value="'+escapeHTML(name)+'">').join('');
  }
  function contactLink(reason,address){
    const message='Olá! Gostaria de consultar a entrega para meu pedido: '+summary+'. Endereço: '+Object.values(address).filter(Boolean).join(', ');
    return '<p>'+escapeHTML(reason)+' Entre em contato para combinar a entrega.</p><a class="primary shipping-whatsapp-link" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(message)+'">Consultar pelo WhatsApp</a>';
  }
  function calculateShipping(){
    shippingCalculated=false;
    clearSuggestion();
    if(fulfillment.value!=='delivery'){
      result.textContent='Retirada selecionada: não será cobrado frete.';
      return;
    }
    const address={street:form.elements.street.value.trim(),number:form.elements.number.value.trim(),complement:form.elements.complement.value.trim(),neighborhood:neighborhoodField.value.trim(),city:cityField.value.trim(),state:stateField.value.trim().toUpperCase(),postal_code:form.elements.postal_code.value.trim()};
    const state=normalize(address.state),cityKey=normalize(address.city),neighborhoodKey=normalize(address.neighborhood);

    if(!address.state){result.textContent='Selecione o estado para verificar as opções de entrega.';return}
    if(state!=='rn'){
      result.innerHTML=contactLink('Por enquanto, entregas fora do Rio Grande do Norte precisam ser combinadas com o vendedor.',address);
      return;
    }
    if(!address.city){result.textContent='Selecione ou digite a cidade para calcular o frete.';return}

    const canonicalCity=exactCanonical(address.city,cityOptions);
    if(!canonicalCity){
      const citySuggestion=nearMatch(address.city,cityOptions);
      if(citySuggestion){showSuggestion(cityField,'city',citySuggestion);return}
      result.innerHTML=contactLink('Esta cidade não possui frete automático cadastrado.',address);
      return;
    }

    let fee=null,reason='';
    if(cityKey==='joao camara'){
      fee=600;
    }else if(cityKey==='ceara mirim'){
      if(!address.neighborhood){result.textContent='Cidade reconhecida. Selecione ou digite o bairro para calcular o frete.';return}
      const canonicalNeighborhood=exactCanonical(address.neighborhood,neighborhoodOptions[cityKey]);
      if(canonicalNeighborhood){
        const normalizedNeighborhood=normalize(canonicalNeighborhood);
        fee=neighborhoodFees[normalizedNeighborhood]??null;
      }else{
        const neighborhoodSuggestion=nearMatch(address.neighborhood,neighborhoodOptions[cityKey]);
        if(neighborhoodSuggestion){showSuggestion(neighborhoodField,'neighborhood',neighborhoodSuggestion);return}
        reason='Esse bairro de Ceará-Mirim não está na lista de entrega automática.';
      }
    }else if(cityKey==='sao goncalo do amarante'){
      if(!address.neighborhood){result.textContent='Cidade reconhecida. Informe o bairro para verificar a entrega automática.';return}
      const canonicalNeighborhood=exactCanonical(address.neighborhood,neighborhoodOptions[cityKey]);
      if(canonicalNeighborhood)fee=1600;
      else{
        const neighborhoodSuggestion=nearMatch(address.neighborhood,neighborhoodOptions[cityKey]);
        if(neighborhoodSuggestion){showSuggestion(neighborhoodField,'neighborhood',neighborhoodSuggestion);return}
        reason='Em São Gonçalo do Amarante, a entrega automática é somente no bairro Jardim Lola.';
      }
    }else if(cityKey==='natal'){
      if(!address.neighborhood){result.textContent='Cidade reconhecida. Selecione ou digite o bairro para calcular o frete.';return}
      const canonicalNeighborhood=exactCanonical(address.neighborhood,neighborhoodOptions[cityKey]);
      if(canonicalNeighborhood)fee=1600;
      else{
        const neighborhoodSuggestion=nearMatch(address.neighborhood,neighborhoodOptions[cityKey]);
        if(neighborhoodSuggestion){showSuggestion(neighborhoodField,'neighborhood',neighborhoodSuggestion);return}
        reason='Em Natal, a entrega automática está disponível somente nos bairros Nordeste, Quintas, Nazaré e Lagoa Nova.';
      }
    }

    if(fee===null){
      result.innerHTML=contactLink(reason||'Não foi possível identificar uma tarifa automática para este endereço.',address);
      return;
    }
    result.textContent='Frete fixo: '+money(fee)+'. Total estimado: '+money(subtotal+fee)+'.';
    shippingCalculated=true;
  }

  const canonicalizeAddress=()=>{
    const city=exactCanonical(cityField.value,cityOptions);
    if(city)cityField.value=city;
    const cityKey=normalize(cityField.value);
    const boroughs=neighborhoodOptions[cityKey]||[];
    const borough=exactCanonical(neighborhoodField.value,boroughs);
    if(borough)neighborhoodField.value=borough;
    if(stateField.value)stateField.value=stateField.value.toUpperCase();
  };
  const setMethod=()=>{
    const delivery=fulfillment.value==='delivery';
    addressFields.hidden=!delivery;
    addressFields.querySelectorAll('input,select').forEach(field=>{
      field.required=delivery&&field.name!=='complement';
    });
    quoteButton.hidden=!delivery;
    updateAddressOptions();
    calculateShipping();
  };

  fulfillment.onchange=setMethod;
  stateField.addEventListener('change',()=>{updateAddressOptions();calculateShipping()});
  cityField.addEventListener('input',()=>{updateAddressOptions();calculateShipping()});
  cityField.addEventListener('change',()=>{canonicalizeAddress();updateAddressOptions();calculateShipping()});
  cityField.addEventListener('blur',()=>{canonicalizeAddress();updateAddressOptions();calculateShipping()});
  neighborhoodField.addEventListener('input',calculateShipping);
  neighborhoodField.addEventListener('change',()=>{canonicalizeAddress();calculateShipping()});
  neighborhoodField.addEventListener('blur',()=>{canonicalizeAddress();calculateShipping()});
  quoteButton.onclick=calculateShipping;
  el.querySelector('#back-cart').onclick=()=>renderCart(el);
  setMethod();
  if(profile?.state&&stateOptions.includes(String(profile.state).toUpperCase()))stateField.value=String(profile.state).toUpperCase();
  else stateField.value='RN';
  updateAddressOptions();
  calculateShipping();

  async function getInvokeError(error){
    let info={};
    try{if(error?.context?.json)info=await error.context.json()}catch{}
    return info;
  }
  form.onsubmit=async e=>{
    e.preventDefault();
    if(fulfillment.value==='delivery'){
      canonicalizeAddress();
      calculateShipping();
      if(!form.reportValidity())return;
      if(!shippingCalculated){
        result.scrollIntoView({behavior:'smooth',block:'nearest'});
        result.textContent='O frete ainda não pode ser calculado automaticamente. Corrija a cidade/bairro ou consulte o vendedor pelo WhatsApp.';
        return;
      }
    }
    const f=new FormData(form),method=f.get('fulfillment_method'),address={street:String(f.get('street')||'').trim(),number:String(f.get('number')||'').trim(),complement:String(f.get('complement')||'').trim(),neighborhood:String(f.get('neighborhood')||'').trim(),city:String(f.get('city')||'').trim(),state:String(f.get('state')||'').trim().toUpperCase(),postal_code:String(f.get('postal_code')||'').trim()};
    submitButton.disabled=true;quoteButton.disabled=true;result.textContent='Criando pedido e checkout seguro…';showLoader('Preparando pagamento pela InfinitePay…');
    try{
      const{data,error}=await supabase.functions.invoke('create-checkout',{body:{fulfillment_method:method,address,customer_notes:f.get('customer_notes')}});
      if(error){const info=await getInvokeError(error);result.textContent=info.message||info.error||'A InfinitePay não conseguiu criar o link de pagamento. Confira a configuração das credenciais e tente novamente.';return}
      if(!data?.checkout_url){result.textContent='A resposta do checkout não contém um link válido. Nenhum redirecionamento foi realizado.';return}
      result.textContent='Pedido criado. Abrindo o pagamento seguro…';toast('Redirecionando para o pagamento seguro…');location.href=data.checkout_url;
    }catch(e){result.textContent='Não foi possível iniciar o pagamento. Verifique a conexão e tente novamente.';console.error('Erro ao criar checkout:',e)}
    finally{hideLoader();submitButton.disabled=false;quoteButton.disabled=false}
  };
}
