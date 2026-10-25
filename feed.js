import{supabase,money,escapeHTML,toast,showLoader,hideLoader}from'./supabaseClient.js';
let target=null,offset=0,loading=false,finished=false,scrollAttached=false;
export async function loadFeed(el){
  target=el;offset=0;finished=false;loading=false;el.innerHTML='';
  await loadMore();
  if(!scrollAttached){window.addEventListener('scroll',()=>{if(target&&!finished&&!loading&&window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-900)loadMore()},{passive:true});scrollAttached=true}
}
async function loadMore(){
  if(!target||loading||finished)return;
  loading=true;
  const start=offset;
  try{
    const{data,error}=await supabase.from('products').select('id,name,price_cents,image_url,created_at').eq('is_published',true).order('created_at',{ascending:false}).range(start,start+29);
    if(error){if(start===0)target.innerHTML='<p class="muted" style="padding:18px">Não foi possível carregar os produtos publicados. Tente atualizar a página.</p>';console.error('Erro ao carregar feed:',error);return}
    if(!data?.length){finished=true;if(start===0)target.innerHTML='<p class="muted" style="padding:18px">Nenhum produto publicado no momento.</p>';return}
    offset+=data.length;if(data.length<30)finished=true;
    const ids=data.map(p=>p.id);
    const{data:images,imageError}=await supabase.from('product_images').select('product_id,image_url,position').in('product_id',ids).order('position',{ascending:true});
    if(imageError)console.warn('Não foi possível carregar imagens adicionais:',imageError);
    const firstImage=new Map();
    for(const item of images||[])if(!firstImage.has(item.product_id))firstImage.set(item.product_id,item.image_url);
    const html=data.map(p=>{const im=firstImage.get(p.id)||p.image_url;return'<button class="product-tile" data-product="'+escapeHTML(p.id)+'" aria-label="Ver '+escapeHTML(p.name)+'">'+(im?'<img loading="lazy" src="'+escapeHTML(im)+'" alt="'+escapeHTML(p.name)+'">':'<span>'+escapeHTML(p.name)+'</span>')+'<span class="tile-caption"><b>'+escapeHTML(p.name)+'</b><span>'+money(p.price_cents)+'</span></span></button>'}).join('');
    target.insertAdjacentHTML('beforeend',html);
    target.querySelectorAll('[data-product]:not([data-bound])').forEach(b=>{b.dataset.bound='true';b.onclick=()=>openProduct(b.dataset.product)});
  }catch(e){console.error('Erro inesperado no feed:',e);if(start===0)target.innerHTML='<p class="muted" style="padding:18px">Ocorreu um erro ao carregar os produtos. Atualize a página para tentar novamente.</p>'}
  finally{loading=false}
}
export async function openProduct(id){
  showLoader('Carregando produto…');
  try{
    const{data:p,error}=await supabase.from('products').select('*').eq('id',id).maybeSingle();
    if(error||!p){toast('Produto indisponível');return}
    const{data:images}=await supabase.from('product_images').select('image_url,position').eq('product_id',id).order('position',{ascending:true});
    p.product_images=images||[];
    const{showProduct}=await import('./comments.js');await showProduct(p);
  }finally{hideLoader()}
}