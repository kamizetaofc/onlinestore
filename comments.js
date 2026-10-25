import{supabase,money,escapeHTML,toast}from'./supabaseClient.js';
const $=s=>document.querySelector(s);
export async function showProduct(p){
  const page=$('#page-view');
  const imgs=(p.product_images||[]).slice().sort((a,b)=>(a.position||0)-(b.position||0)).map(x=>x.image_url).filter(Boolean);
  if(p.image_url&&!imgs.includes(p.image_url))imgs.unshift(p.image_url);
  const images=[...new Set(imgs)];
  const {data:{user}}=await supabase.auth.getUser();
  let liked=false;
  if(user){const q=await supabase.from('wishlist').select('id').eq('user_id',user.id).eq('product_id',p.id).maybeSingle();liked=!!q.data}
  document.querySelector('.profile-header').hidden=true;
  document.querySelector('.category-section').hidden=true;
  document.querySelector('.tabs').hidden=true;
  $('#feed-view').hidden=true;
  $('#reels-view').hidden=true;
  page.hidden=false;
  let imageIndex=0;
  const firstSize=p.available_sizes?.[0]||'M';
  const render=()=>{
    page.innerHTML='<div class="product-activity"><button type="button" class="product-back" id="product-back" aria-label="Voltar ao perfil"><i class="fa-solid fa-arrow-left"></i></button><header class="product-activity-header"><img src="./kamizeta.png" alt="Kamizeta" onerror="this.style.visibility=\'hidden\'"><b>kamizeta</b></header><div class="product-media">'+(images.length?'<img class="product-main-image" id="product-main-image" src="'+escapeHTML(images[imageIndex])+'" alt="'+escapeHTML(p.name)+'">':'<div class="product-image-empty">Sem imagem</div>')+(images.length>1?'<button class="product-image-arrow previous" id="image-prev" aria-label="Imagem anterior"><i class="fa-solid fa-chevron-left"></i></button><button class="product-image-arrow next" id="image-next" aria-label="Próxima imagem"><i class="fa-solid fa-chevron-right"></i></button>':'')+'</div>'+(images.length>1?'<div class="product-dots" aria-label="Imagens do produto">'+images.map((_,i)=>'<button type="button" data-dot="'+i+'" class="'+(i===imageIndex?'active':'')+'" aria-label="Imagem '+(i+1)+'"></button>').join('')+'</div>':'')+'<section class="product-activity-info"><div class="product-name-price"><b>'+escapeHTML(p.name)+'</b><span>'+money(p.price_cents)+'</span></div><div class="product-icon-actions"><button type="button" id="like" aria-label="'+(liked?'Descurtir':'Curtir')+'" title="Curtir"><i class="'+(liked?'fa-solid':'fa-regular')+' fa-heart"></i></button><button type="button" id="comments" aria-label="Descrição do produto" title="Descrição"><i class="fa-regular fa-comment"></i></button><button type="button" id="share" aria-label="Compartilhar produto" title="Compartilhar"><i class="fa-regular fa-paper-plane"></i></button><span class="action-spacer"></span><button type="button" id="save" aria-label="Salvar no carrinho" title="Salvar no carrinho"><i class="fa-regular fa-bookmark"></i></button><button type="button" id="buy" aria-label="Comprar agora" title="Comprar agora"><i class="fa-solid fa-circle-dollar-to-slot"></i></button></div></section><div class="product-options"><label>Tamanho<select id="product-size">'+(p.available_sizes?.length?p.available_sizes:['PP','P','M','G','GG']).map(s=>'<option>'+escapeHTML(s)+'</option>').join('')+'</select></label><label>Qtd.<input id="product-qty" type="number" min="1" max="20" value="1"></label></div></div>';
    $('#product-back').onclick=()=>import('./home.js').then(m=>m.navigate('home'));
    const changeImage=(next)=>{imageIndex=(next+images.length)%images.length;render()};
    $('#image-prev')?.addEventListener('click',()=>changeImage(imageIndex-1));
    $('#image-next')?.addEventListener('click',()=>changeImage(imageIndex+1));
    page.querySelectorAll('[data-dot]').forEach(b=>b.onclick=()=>changeImage(Number(b.dataset.dot)));
    const mainImage=$('#product-main-image');
    if(mainImage&&images.length>1){
      let touchX=0;
      mainImage.addEventListener('touchstart',e=>{touchX=e.changedTouches[0].screenX},{passive:true});
      mainImage.addEventListener('touchend',e=>{const dx=e.changedTouches[0].screenX-touchX;if(Math.abs(dx)>45)changeImage(imageIndex+(dx<0?1:-1))},{passive:true});
    }
    const openDescription=()=>{
      const d=$('#info-dialog'),el=$('#info-content');
      el.innerHTML='<div class="product-description-modal"><h3>kamizeta</h3><p>'+escapeHTML(p.description||'Este produto não possui descrição.')+'</p></div>';
      d.showModal();
    };
    $('#comments').onclick=openDescription;
    $('#like').onclick=async()=>{
      const{data:{user}}=await supabase.auth.getUser();
      if(!user){const{showLogin}=await import('./userProfile.js');showLogin();return}
      const q=await supabase.from('wishlist').select('id').eq('user_id',user.id).eq('product_id',p.id).maybeSingle();
      if(q.data){
        const{error}=await supabase.from('wishlist').delete().eq('user_id',user.id).eq('product_id',p.id);
        if(error)toast('Não foi possível remover a curtida.');
        else{liked=false;$('#like').innerHTML='<i class="fa-regular fa-heart"></i>';$('#like').setAttribute('aria-label','Curtir');toast('Curtida removida.')}
      }else{
        const{error}=await supabase.from('wishlist').insert({user_id:user.id,product_id:p.id});
        if(!error){liked=true;$('#like').innerHTML='<i class="fa-solid fa-heart"></i>';$('#like').setAttribute('aria-label','Descurtir');toast('Produto curtido.')}
        else toast('Não foi possível curtir este produto.');
      }
    };
    const add=async checkout=>{
      const{addToCart,startCheckout}=await import('./cart.js');
      const size=$('#product-size')?.value||firstSize,quantity=Number($('#product-qty')?.value||1);
      const ok=await addToCart(p,size,quantity,'');
      if(ok&&checkout){const{navigate}=await import('./home.js');await navigate('cart');await startCheckout($('#page-view'))}
    };
    $('#save').onclick=()=>add(false);
    $('#buy').onclick=()=>add(true);
    $('#share').onclick=async()=>{
      const u=new URL(location.href);u.searchParams.set('product',p.id);
      try{if(navigator.share)await navigator.share({title:p.name,url:u.href});else{await navigator.clipboard.writeText(u.href);toast('Link copiado')}}
      catch(e){if(e.name!=='AbortError')toast('Falha ao compartilhar')}
    };
  };
  render();
}