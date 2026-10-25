import{supabase,escapeHTML,toast}from'./supabaseClient.js';
export async function loadCategories(el,open){
  const{data,error}=await supabase.from('categories').select('*').order('name');
  if(error||!data?.length){el.innerHTML='<p class="muted">Categorias aparecerão quando houver produtos.</p>';return}
  el.innerHTML=data.map(c=>'<button class="category-item" data-category="'+escapeHTML(c.name)+'"><span class="category-image">'+(c.cover_image_url?'<img src="'+escapeHTML(c.cover_image_url)+'" alt="">':'K.')+'</span><span>'+escapeHTML(c.name)+'</span></button>').join('');
  el.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>open(b.dataset.category));
}
export async function openCategoryStories(category){
  const{data:cats}=await supabase.from('categories').select('name').order('name');
  const names=(cats||[]).map(c=>c.name);
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLocaleLowerCase('pt-BR');
  const selectedIndex=names.findIndex(n=>normalize(n)===normalize(category));
  const sequence=selectedIndex>=0?names.slice(selectedIndex):[category];
  const{data:products,error}=await supabase.from('products').select('id,name,image_url,description,price_cents,category,created_at').eq('is_published',true).order('created_at',{ascending:true});
  if(error){toast('Não foi possível carregar os produtos deste destaque.');console.error(error);return}
  const all=[];
  for(const name of sequence)for(const p of products||[])if(normalize(p.category)===normalize(name))all.push({...p,storyCategory:name});
  if(!all.length){toast('Ainda não há produtos publicados neste destaque.');return}
  const ids=[...new Set(all.map(p=>p.id))];
  const{data:images}=await supabase.from('product_images').select('product_id,image_url,position').in('product_id',ids).order('position',{ascending:true});
  const grouped=new Map();
  for(const im of images||[]){if(!grouped.has(im.product_id))grouped.set(im.product_id,[]);grouped.get(im.product_id).push(im)}
  for(const p of all)p.product_images=grouped.get(p.id)||[];
  const d=document.querySelector('#info-dialog'),el=document.querySelector('#info-content');
  let i=0;
  function draw(){
    const p=all[i],im=p.product_images?.[0]?.image_url||p.image_url;
    el.innerHTML='<p class="muted">'+escapeHTML(p.storyCategory)+' · '+(i+1)+' / '+all.length+'</p>'+(im?'<button id="highlight-product-image" class="highlight-product-image" aria-label="Abrir '+escapeHTML(p.name)+'"><img src="'+escapeHTML(im)+'" alt="'+escapeHTML(p.name)+'"></button>':'')+'<h3>'+escapeHTML(p.name)+'</h3><p>'+escapeHTML(p.description||'')+'</p><p><b>'+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((p.price_cents||0)/100)+'</b></p><button id="next-story" class="primary">'+(i===all.length-1?'Concluir':'Próximo')+'</button> <button id="open-product" class="secondary">Ver produto</button>';
    const open=async()=>{d.close();const{openProduct}=await import('./feed.js');await openProduct(p.id)};
    el.querySelector('#highlight-product-image')?.addEventListener('click',open);
    el.querySelector('#open-product').onclick=open;
    el.querySelector('#next-story').onclick=()=>{if(++i>=all.length){d.close();return}draw()};
  }
  draw();d.showModal();
}