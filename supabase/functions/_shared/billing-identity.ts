export function normalizeTaxId(v:unknown){return String(v||'').toUpperCase().replace(/[.\-/\s]/g,'');}
export function validTaxId(type:string,value:unknown){
 const n=normalizeTaxId(value);if(/^(.)\1+$/.test(n))return false;
 if(type==='pf'){
  if(!/^\d{11}$/.test(n))return false;
  const digit=(len:number)=>{const rem=Array.from(n.slice(0,len)).reduce((s,c,i)=>s+Number(c)*(len+1-i),0)*10%11;return rem===10?0:rem;};
  return digit(9)===Number(n[9])&&digit(10)===Number(n[10]);
 }
 if(type!=='pj'||!/^([A-Z0-9]{12})(\d{2})$/.test(n))return false;
 const digit=(len:number)=>{const weights=len===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];const rem=Array.from(n.slice(0,len)).reduce((s,c,i)=>s+(c.charCodeAt(0)-48)*weights[i],0)%11;return rem<2?0:11-rem;};
 return digit(12)===Number(n[12])&&digit(13)===Number(n[13]);
}
export function formatTaxId(type:string,v:unknown){const n=normalizeTaxId(v);return type==='pf'?n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4'):n.replace(/^(.{2})(.{3})(.{3})(.{4})(\d{2})$/,'$1.$2.$3/$4-$5');}
export function billingIdentity(body:Record<string,unknown>){
 const type=body.person_type;if(typeof type!=='string'||!['pf','pj'].includes(type))throw Error('Escolha pessoa física ou jurídica.');
 const field=(name:string,max:number)=>{const v=String(body[name]||'').trim().replace(/\s+/g,' ');if(v.length>max||Array.from(v).some(c=>c.charCodeAt(0)<32))throw Error('Confira os dados do cadastro.');return v;};
 const legal_name=field('legal_name',180);if(legal_name.length<3)throw Error(type==='pf'?'Informe o nome completo.':'Informe a razão social.');
 if(!validTaxId(type,body.tax_id))throw Error(type==='pf'?'Confira o CPF informado.':'Confira o CNPJ informado.');
 const email=field('email',254).toLowerCase(),zip=field('zip',9).replace(/\D/g,''),state=field('state',2).toUpperCase();
 if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Error('Informe um e-mail válido.');
 if(zip&&zip.length!==8)throw Error('O CEP deve ter 8 dígitos.');
 if(state&&!['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(state))throw Error('Confira a UF.');
 return{person_type:type,legal_name,tax_id:normalizeTaxId(body.tax_id),trade_name:type==='pj'?field('trade_name',150):'',email,phone:field('phone',40),zip,street:field('street',180),number:field('number',20),complement:field('complement',100),district:field('district',100),city:field('city',100),state};
}
