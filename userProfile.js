import{supabase,escapeHTML,money,toast,withTimeout,showLoader,hideLoader}from'./supabaseClient.js';
import{signIn,signUp,signOut}from'./auth.js';

export function showLogin(notice=''){
  const d=document.querySelector('#auth-dialog'),el=document.querySelector('#auth-content');
  el.innerHTML='<h2>Entrar na Kamizeta</h2>'+(notice?'<p id="auth-feedback" class="form-feedback success" role="status">'+escapeHTML(notice)+'</p>':'<p id="auth-feedback" class="form-feedback" role="status" hidden></p>')+'<form id="login"><label class="field">E-mail<input name="email" type="email" autocomplete="email" required></label><label class="field">Senha<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Entrar</button></form><p>Ainda não tem conta? <button type="button" id="signup" class="secondary">Crie uma</button></p>';
  el.querySelector('#login').onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.currentTarget),feedback=el.querySelector('#auth-feedback'),button=e.currentTarget.querySelector('button[type="submit"]');
    feedback.hidden=false;feedback.className='form-feedback';feedback.textContent='';
    button.disabled=true;
    try{await signIn(f.get('email'),f.get('password'));d.close();toast('Login realizado com sucesso.');const route=document.querySelector('#page-view')?.dataset.view;if(route==='profile'||route==='cart'){const app=await import('./home.js');await app.navigate(route)}}
    catch(x){feedback.textContent=x?.message||'Não foi possível entrar. Confira seu e-mail e senha.';feedback.classList.add('error');}
    finally{button.disabled=false}
  };
  el.querySelector('#signup').onclick=()=>signupForm(el,d);
  if(!d.open)d.showModal();
}

function signupForm(el,d){
  el.innerHTML='<h2>Criar conta</h2><p id="signup-feedback" class="form-feedback" role="status" hidden></p><form id="signup-form">'+[['full_name','Nome completo','text'],['cpf','CPF','text'],['phone','Telefone / WhatsApp','tel'],['email','E-mail','email'],['password','Senha','password'],['confirm','Confirmar senha','password']].map(([n,l,t])=>'<label class="field">'+l+'<input name="'+n+'" type="'+t+'" required '+(['password','confirm'].includes(n)?'minlength="8"':'')+' '+(n==='email'?'autocomplete="email"':'')+' '+(n==='password'?'autocomplete="new-password"':'')+' '+(n==='confirm'?'autocomplete="new-password"':'')+'></label>').join('')+'<p id="password-mismatch" class="form-feedback error" role="alert" hidden>As senhas não coincidem. Digite a mesma senha nos dois campos.</p><button class="primary" type="submit">Criar conta</button><button class="secondary" type="button" id="back-login">Já tenho conta</button></form>';
  const form=el.querySelector('#signup-form'),pass=form.elements.password,confirm=form.elements.confirm,warning=el.querySelector('#password-mismatch'),feedback=el.querySelector('#signup-feedback'),submit=form.querySelector('button[type="submit"]');
  const checkPasswords=()=>{const mismatch=!!confirm.value&&pass.value!==confirm.value;warning.hidden=!mismatch;confirm.setCustomValidity(mismatch?'As senhas não coincidem.':'');return !mismatch};
  pass.addEventListener('input',checkPasswords);confirm.addEventListener('input',checkPasswords);
  form.onsubmit=async e=>{
    e.preventDefault();
    feedback.hidden=true;feedback.textContent='';checkPasswords();
    if(pass.value!==confirm.value){warning.hidden=false;confirm.focus();return}
    if(!form.reportValidity())return;
    const f=new FormData(form);
    submit.disabled=true;
    showLoader('Criando sua conta…');
    try{
      const result=await signUp({full_name:f.get('full_name'),cpf:f.get('cpf'),phone:f.get('phone'),email:f.get('email'),password:f.get('password')});
      d.close();
      const message=result?.user&&!result?.session?'Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.':'Conta criada com sucesso. Entre com seu e-mail e senha.';
      showLogin(message);
    }catch(x){
      feedback.hidden=false;feedback.className='form-feedback error';feedback.textContent=x?.message||'Não foi possível criar a conta. Tente novamente.';
    }finally{hideLoader();submit.disabled=false}
  };
  el.querySelector('#back-login').onclick=()=>showLogin();
  if(!d.open)d.showModal();
}

const profileInput=(name,label,value,type='text',extra='')=>'<label class="field">'+label+'<input name="'+name+'" type="'+type+'" value="'+escapeHTML(value||'')+'" '+extra+'></label>';
const brazilStates=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const freightCities=['Ceará-Mirim','João Câmara','São Gonçalo do Amarante','Natal'];
const profileStateSelect=()=>'<label class="field">Estado (UF)<select name="state" autocomplete="address-level1" required><option value="">Selecione a UF</option>'+brazilStates.map(state=>'<option value="'+state+'">'+state+'</option>').join('')+'</select></label>';
const profileCityCombobox=()=>'<label class="field">Cidade<input id="profile-city" name="city" type="text" list="profile-city-options" autocomplete="address-level2" required><datalist id="profile-city-options"></datalist></label>';
function renderProfileSummary(profile,user){
  const p=profile||{};
  const address=[p.address_line,p.address_number,p.address_complement,p.neighborhood,p.city,p.state,p.postal_code].filter(Boolean).join(', ');
  const rows=[
    ['Nome',p.full_name||user.user_metadata?.full_name||'Não informado'],
    ['CPF',p.cpf||'Não informado'],
    ['Telefone',p.phone||'Não informado'],
    ['Instagram',p.instagram||'Não informado'],
    ['E-mail',p.email||user.email||'Não informado'],
    ['Endereço',address||'Endereço não informado']
  ];
  const root=document.querySelector('#profile-summary-details');
  if(root)root.innerHTML=rows.map(([label,value])=>'<p class="profile-summary-row"><span>'+escapeHTML(label)+'</span><b>'+escapeHTML(value)+'</b></p>').join('');
}
const terminalOrderStatuses=new Set(['cancelled','canceled','completed','delivered','refunded','failed','closed']);
function orderCard(o){
  const items=(o.order_items||[]).map(i=>'<p class="muted">'+escapeHTML(i.product_name)+' · '+i.quantity+'x · '+escapeHTML(i.size)+' · '+money(i.unit_price_cents*i.quantity)+'</p>').join('');
  const cancel=['awaiting_payment','created'].includes(String(o.order_status||'').toLowerCase())?'<button type="button" class="secondary" data-cancel-order="'+escapeHTML(o.id)+'">Cancelar pedido</button>':'';
  return '<article class="profile-order"><div class="profile-order-top"><b>Pedido '+escapeHTML(o.order_nsu||'')+'</b><strong>'+money(o.total_cents)+'</strong></div><p>Pedido: '+escapeHTML(o.order_status)+' · Pagamento: '+escapeHTML(o.payment_status)+'</p><p class="muted">'+(o.created_at?new Date(o.created_at).toLocaleString('pt-BR'):'')+' · '+(o.fulfillment_method==='delivery'?'Entrega':'Retirada')+'</p>'+items+cancel+'</article>';
}

export async function renderProfile(el){
  const{data:{user},error:authError}=await withTimeout(supabase.auth.getUser(),10000,'Não foi possível confirmar sua sessão. Tente entrar novamente.');
  if(authError||!user){showLogin('Entre na sua conta para visualizar seu perfil.');return}
  el.innerHTML='<section class="private-profile"><header class="private-profile-heading"><img src="./kamizeta.png" alt="Kamizeta" onerror="this.hidden=true"><div><h2>Meu perfil</h2><p>'+escapeHTML(user.email||'')+'</p></div></header><p id="profile-feedback" class="form-feedback" role="status" hidden></p><section class="profile-data-summary"><div class="profile-summary-heading"><h3>Dados pessoais</h3><button type="button" id="edit-profile" class="profile-edit-icon" aria-label="Editar dados pessoais" title="Editar dados pessoais"><i class="fa-solid fa-pen"></i></button></div><div id="profile-summary-details"><p class="muted">Carregando seus dados…</p></div></section><dialog id="profile-edit-dialog" class="modal profile-edit-dialog"><button type="button" id="close-profile-edit" class="modal-close" aria-label="Fechar">×</button><article><h2>Editar dados pessoais</h2><p id="profile-edit-feedback" class="form-feedback" role="status" hidden></p><form id="profile-form" class="profile-data-form"><h3>Dados pessoais</h3>'+profileInput('full_name','Nome completo',user.user_metadata?.full_name||'','text','autocomplete="name" required')+profileInput('cpf','CPF','','text','inputmode="numeric"')+profileInput('phone','Telefone / WhatsApp','','tel','autocomplete="tel"')+profileInput('instagram','Instagram','','text','')+'<p class="profile-readonly-email">E-mail: <b>'+escapeHTML(user.email||'')+'</b></p><h3>Endereço</h3>'+profileInput('address_line','Rua', '', 'text','autocomplete="street-address"')+profileInput('address_number','Número','','text','')+profileInput('address_complement','Complemento','','text','')+profileInput('neighborhood','Bairro','','text','')+profileCityCombobox()+profileStateSelect()+profileInput('postal_code','CEP','','text','autocomplete="postal-code"')+'<button type="submit" class="primary">Salvar meus dados</button></form></article></dialog><section class="profile-password"><h3>Senha</h3><p>Por segurança, sua senha nunca é exibida.</p><button type="button" id="show-new-password" class="secondary">Definir nova senha</button><form id="new-password-form" class="profile-data-form" hidden><label class="field">Senha atual (se solicitada)<input name="current_password" type="password" autocomplete="current-password"></label><label class="field">Nova senha<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label class="field">Confirmar nova senha<input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label><p id="new-password-error" class="form-feedback error" role="alert" hidden>As senhas não coincidem.</p><button class="primary" type="submit">Atualizar senha</button></form></section><section class="profile-orders"><h3>Meus pedidos</h3><div class="profile-order-tabs"><button type="button" class="active" data-orders-view="current">Pedidos atuais</button><button type="button" data-orders-view="history">Histórico</button></div><div id="profile-orders-list"><p class="muted">Carregando pedidos…</p></div></section><section class="profile-wishlist"><h3>Lista de desejos</h3><div id="profile-wishlist-list"><p class="muted">Carregando lista…</p></div></section><button type="button" id="logout" class="secondary profile-logout"><i class="fa-solid fa-right-from-bracket"></i> Sair da conta</button></section>';
  const form=el.querySelector('#profile-form'),feedback=el.querySelector('#profile-feedback'),editFeedback=el.querySelector('#profile-edit-feedback'),editDialog=el.querySelector('#profile-edit-dialog'),passwordForm=el.querySelector('#new-password-form'),passwordError=el.querySelector('#new-password-error'),ordersList=el.querySelector('#profile-orders-list'),wishlistList=el.querySelector('#profile-wishlist-list');
  el.querySelector('#edit-profile').onclick=()=>editDialog.showModal();
  el.querySelector('#close-profile-edit').onclick=()=>editDialog.close();
  const updateProfileCityOptions=()=>{const list=form.querySelector('#profile-city-options');list.innerHTML=form.elements.state.value==='RN'?freightCities.map(city=>'<option value="'+escapeHTML(city)+'">').join(''):''};
  form.elements.state.addEventListener('change',updateProfileCityOptions);
  try{
    const [profileResult,ordersResult,wishesResult]=await Promise.all([
      withTimeout(supabase.from('profiles').select('full_name,cpf,phone,instagram,email,address_line,address_number,address_complement,neighborhood,city,state,postal_code').eq('user_id',user.id).maybeSingle(),10000,'Tempo esgotado ao carregar seu perfil.'),
      withTimeout(supabase.from('orders').select('id,order_nsu,total_cents,order_status,payment_status,fulfillment_method,created_at,order_items(product_name,quantity,size,unit_price_cents)').eq('user_id',user.id).order('created_at',{ascending:false}),10000,'Tempo esgotado ao carregar seus pedidos.'),
      withTimeout(supabase.from('wishlist').select('product_id,products(id,name,price_cents,image_url)').eq('user_id',user.id).order('created_at',{ascending:false}),10000,'Tempo esgotado ao carregar sua lista de desejos.')
    ]);
    if(profileResult.error)throw profileResult.error;
    const p=profileResult.data||{};
    for(const [name,value] of Object.entries({full_name:p.full_name||user.user_metadata?.full_name||'',cpf:p.cpf||'',phone:p.phone||'',instagram:p.instagram||'',address_line:p.address_line||'',address_number:p.address_number||'',address_complement:p.address_complement||'',neighborhood:p.neighborhood||'',city:p.city||'',state:p.state||'',postal_code:p.postal_code||''})){if(form.elements[name])form.elements[name].value=value};updateProfileCityOptions();renderProfileSummary(p,user)
    if(ordersResult.error)throw ordersResult.error;
    const orders=ordersResult.data||[];
    const currentOrders=orders.filter(o=>!terminalOrderStatuses.has(String(o.order_status||'').toLowerCase())&&!terminalOrderStatuses.has(String(o.payment_status||'').toLowerCase()));
    const historyOrders=orders.filter(o=>!currentOrders.includes(o));
    const displayOrders=view=>{const list=view==='history'?historyOrders:currentOrders;ordersList.innerHTML=list.length?list.map(orderCard).join(''):'<p class="muted">'+(view==='history'?'Você ainda não tem pedidos anteriores.':'Você não tem pedidos em andamento.')+'</p>';ordersList.querySelectorAll('[data-cancel-order]').forEach(btn=>btn.onclick=async()=>{btn.disabled=true;showLoader('Cancelando pedido…');try{const{data,error}=await supabase.functions.invoke('cancel-order',{body:{order_id:btn.dataset.cancelOrder}});if(error){let info={};try{info=await error.context.json()}catch{}throw new Error(info.message||info.error||'Não foi possível cancelar o pedido.')}toast('Pedido cancelado.');await renderProfile(el)}catch(e){toast(e.message||'Não foi possível cancelar o pedido.');btn.disabled=false}finally{hideLoader()}})};
    displayOrders('current');
    el.querySelectorAll('[data-orders-view]').forEach(btn=>btn.onclick=()=>{el.querySelectorAll('[data-orders-view]').forEach(b=>b.classList.toggle('active',b===btn));displayOrders(btn.dataset.ordersView)});
    if(wishesResult.error)throw wishesResult.error;
    const wishes=wishesResult.data||[];
    wishlistList.innerHTML=wishes.length?wishes.map(w=>'<article class="cart-row">'+(w.products?.image_url?'<img src="'+escapeHTML(w.products.image_url)+'" alt="">':'')+'<div><b>'+escapeHTML(w.products?.name||'Produto indisponível')+'</b><p>'+money(w.products?.price_cents||0)+'</p><button type="button" class="secondary" data-open-product="'+escapeHTML(w.products?.id||'')+'">Ver produto</button> <button type="button" class="secondary" data-remove-wish="'+escapeHTML(w.products?.id||'')+'" aria-label="Remover curtida" title="Remover curtida"><i class="fa-solid fa-heart-crack"></i></button></div></article>').join(''):'<p class="muted">Você ainda não curtiu produtos.</p>';
    wishlistList.querySelectorAll('[data-remove-wish]').forEach(btn=>btn.onclick=async()=>{if(!btn.dataset.removeWish)return;showLoader('Atualizando lista…');try{const{error}=await supabase.from('wishlist').delete().eq('user_id',user.id).eq('product_id',btn.dataset.removeWish);if(error)throw error;toast('Curtida removida.');await renderProfile(el)}catch(e){toast('Não foi possível remover a curtida.');}finally{hideLoader()}});
    wishlistList.querySelectorAll('[data-open-product]').forEach(btn=>btn.onclick=async()=>{if(!btn.dataset.openProduct)return;const{openProduct}=await import('./feed.js');await openProduct(btn.dataset.openProduct)});
  }catch(e){
    console.error('Erro ao carregar o perfil:',e);
    feedback.hidden=false;feedback.className='form-feedback error';feedback.textContent='Não foi possível carregar todos os dados do perfil. Atualize a página e tente novamente.';
    ordersList.innerHTML='<p class="muted">Não foi possível carregar os pedidos.</p>';
    wishlistList.innerHTML='<p class="muted">Não foi possível carregar a lista de desejos.</p>';
  }
  form.onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(form),fields={full_name:String(f.get('full_name')||'').trim(),cpf:String(f.get('cpf')||'').trim(),phone:String(f.get('phone')||'').trim(),instagram:String(f.get('instagram')||'').trim(),address_line:String(f.get('address_line')||'').trim(),address_number:String(f.get('address_number')||'').trim(),address_complement:String(f.get('address_complement')||'').trim(),neighborhood:String(f.get('neighborhood')||'').trim(),city:String(f.get('city')||'').trim(),state:String(f.get('state')||'').trim().toUpperCase(),postal_code:String(f.get('postal_code')||'').trim(),email:user.email||null};
    if(!fields.full_name){editFeedback.hidden=false;editFeedback.className='form-feedback error';editFeedback.textContent='Informe seu nome completo.';return}
    showLoader('Salvando seus dados…');editFeedback.hidden=true;
    try{
      const{error}=await supabase.from('profiles').upsert({user_id:user.id,...fields},{onConflict:'user_id'});
      if(error)throw error;
      renderProfileSummary(fields,user);
      toast('Perfil atualizado.');
      editDialog.close();
    }catch(e){
      editFeedback.hidden=false;editFeedback.className='form-feedback error';editFeedback.textContent='Não foi possível salvar os dados. Tente novamente.';console.error('Erro ao salvar perfil:',e);
    }finally{hideLoader()}
  };
  el.querySelector('#show-new-password').onclick=()=>{passwordForm.hidden=!passwordForm.hidden;passwordError.hidden=true};
  passwordForm.onsubmit=async e=>{
    e.preventDefault();
    const pass=passwordForm.elements.password.value,confirm=passwordForm.elements.confirm.value,currentPassword=passwordForm.elements.current_password.value;
    if(pass!==confirm){passwordError.hidden=false;passwordForm.elements.confirm.focus();return}
    passwordError.hidden=true;showLoader('Atualizando senha…');
    try{const attributes={password:pass};if(currentPassword)attributes.current_password=currentPassword;const{error}=await supabase.auth.updateUser(attributes);if(error)throw error;passwordForm.reset();passwordForm.hidden=true;toast('Senha atualizada com sucesso.')}
    catch(e){passwordError.hidden=false;passwordError.textContent=e?.message||'Não foi possível atualizar a senha. Entre novamente e tente de novo.';console.error('Erro ao atualizar senha:',e)}
    finally{hideLoader()}
  };
  el.querySelector('#logout').onclick=async()=>{showLoader('Saindo da conta…');try{await signOut();await import('./home.js').then(m=>m.navigate('home'));showLogin('Você saiu da sua conta.')}catch(e){toast('Não foi possível sair da conta.')}finally{hideLoader()}};
}
