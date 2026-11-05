import type {DatabaseClient} from './database-client.ts';
export async function shopLinks(db:DatabaseClient,owner:string){
 const{data}=await db.from('tenants').select('slug').eq('owner_id',owner).eq('status','active').maybeSingle();
 const base=data?.slug&&data.slug!=='domvere'?`/t/${data.slug}`:'';
 return{booking:`https://agendar.zlabs.com.br${base}/`,panel:`https://domvere.zlabs.com.br${base}`,professional:`https://barber.zlabs.com.br${base}`};
}
