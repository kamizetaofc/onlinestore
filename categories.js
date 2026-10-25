import{supabase,escapeHTML,toast,withTimeout}from'./supabaseClient.js';
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR');
export async function loadCategories(el,open){
  el.innerHTML='<p class="muted">Carregando categorias…</p>';
  try{
    const{data,error}=await withTimeout(supabase.from('categories').select('id,name,cover_image_url').order('name'),12000,'Tempo esgotado ao carregar categorias.');
    if(error)throw error;
    if(!data?.length){el.innerHTML='<p class="muted">Nenhuma categoria cadastrada ainda.</p>';return}
    el.innerHTML=data.map(c=>'<button class="category-item" data-category="'+escapeHTML(c.name)+'"><span class="category-image">'+(c.cover_image_url?'<img loading="lazy" src="'+escapeHTML(c.cover_image_url)+'" alt="">':'K.')+'</span><span>'+escapeHTML(c.name)+'</span></button>').join('');
    el.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>open(b.dataset.category));
  }catch(e){
    console.error('Erro ao carregar categorias:',e);
    el.innerHTML='<p class="muted category-error">Não foi possível carregar as categorias. <button type="button" id="retry-categories" class="secondary">Tentar novamente</button></p>';
    el.querySelector('#retry-categories').onclick=()=>loadCategories(el,open);
  }
}
export async function openCategoryStories(category){
  const d=document.querySelector('#info-dialog'),el=document.querySelector('#info-content');
  el.innerHTML='<p class="muted">Carregando produtos da categoria…</p>';d.showModal();
  try{
    const{data:products,error}=await withTimeout(supabase.from('products').select('id,name,image_url,description,price_cents,category,created_at').eq('is_published',true).order('created_at',{ascending:false}),12000,'Tempo esgotado ao carregar os produtos.');
    if(error)throw error;
    const all=(products||[]).filter(p=>normalize(p.category)===normalize(category));
    if(!all.length){el.innerHTML='<h2>'+escapeHTML(category)+'</h2><p class="muted">Ainda não há produtos publicados nesta categoria.</p><button class="secondary" id="close-category">Fechar</button>';el.querySelector('#close-category').onclick=()=>d.close();return}
    const ids=all.map(p=>p.id);
    const{data:images,error:imageError}=await withTimeout(supabase.from('product_images').select('product_id,image_url,position').in('product_id',ids).order('position',{ascending:true}),12000,'Tempo esgotado ao carregar as imagens.');
    if(imageError)console.warn('Imagens adicionais não carregadas:',imageError);
    const byProduct=new Map();for(const im of images||[]){if(!byProduct.has(im.product_id))byProduct.set(im.product_id,[]);byProduct.get(im.product_id).push(im)}
    all.forEach(p=>p.product_images=byProduct.get(p.id)||[]);
    let i=0;
    function draw(){
      const p=all[i],im=p.product_images?.[0]?.image_url||p.image_url;
      el.innerHTML='<div class="category-image-only">'+(im?'<img src="'+escapeHTML(im)+'" alt="'+escapeHTML(p.name)+'">':'<div class="category-slide-placeholder">Sem imagem</div>')+(all.length>1?'<button type="button" id="previous-product" class="category-image-arrow previous" '+(i===0?'disabled':'')+' aria-label="Produto anterior"><i class="fa-solid fa-chevron-left"></i></button><button type="button" id="next-product" class="category-image-arrow next" '+(i===all.length-1?'disabled':'')+' aria-label="Próximo produto"><i class="fa-solid fa-chevron-right"></i></button>':'')+'</div><button id="view-product" class="primary category-view-product">Ver produto</button>';
      el.querySelector('#previous-product')?.addEventListener('click',()=>{if(i>0){i--;draw()}});
      el.querySelector('#next-product')?.addEventListener('click',()=>{if(i<all.length-1){i++;draw()}});
      el.querySelector('#view-product').onclick=async()=>{d.close();const{openProduct}=await import('./feed.js');await openProduct(p.id)};
    }

  }catch(e){
    console.error('Erro ao abrir categoria:',e);
    el.innerHTML='<h2>'+escapeHTML(category)+'</h2><p class="muted">Não foi possível carregar os produtos desta categoria.</p><button id="retry-category-products" class="secondary">Tentar novamente</button>';
    el.querySelector('#retry-category-products').onclick=()=>openCategoryStories(category);
  }
}