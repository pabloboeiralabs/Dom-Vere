import{formatTaxId,type billingIdentity}from'./billing-identity.ts';
import {PDFDocument,StandardFonts,rgb} from 'https://esm.sh/pdf-lib@1.17.1';
import {receiptLogo} from './receipt-logo.ts';
export type ReceiptSnapshot={issuer:string;project:string;responsible?:string;amount_cents:number;is_down_payment?:boolean;billing_kind:string;installment_number?:number;installment_count?:number;installment_amount_cents:number;monthly_amount_cents:number;recipient?:Partial<ReturnType<typeof billingIdentity>>;due_date:string;payment_method:string;plan?:string;paid_at:string;address:string;district:string;city:string;zip:string};
export type PaymentReceipt={id:string;number:string;created_at:string;snapshot:ReceiptSnapshot};
export const receiptUrl=(token:string)=>'https://domvere-api.zlabs.com.br/functions/v1/platform-receipt?token='+encodeURIComponent(token);
export const receiptMoney=(c:number)=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function receiptDescription(s:ReceiptSnapshot){return s.is_down_payment?'Entrada da compra do sistema':s.billing_kind==='sale'?`Parcela ${s.installment_number}/${s.installment_count} da compra do sistema`:'Mensalidade';}
export function receiptCaption(s:ReceiptSnapshot){const first=String(s.responsible||'').trim().split(/\s+/)[0];return `Oi${first?', '+first:''}! Vi aqui que o pagamento de ${s.project} já foi confirmado. Muito obrigada! 😊\n\nEstou te enviando o recibo de ${receiptMoney(s.amount_cents)}, referente à ${receiptDescription(s).toLowerCase()}${s.billing_kind==='sale'&&s.monthly_amount_cents>0?' e à mensalidade':''}.\n\nQualquer coisa, é só me chamar por aqui.\nDora | Z-labs`;}
export function receiptFilename(r:{number:string}){return `recibo-${r.number}.pdf`;}
export async function generateReceipt(r:PaymentReceipt,sample=false){
 const s=r.snapshot,doc=await PDFDocument.create();doc.setTitle(`Recibo de pagamento ${r.number}`);doc.setAuthor(s.issuer);doc.setSubject('Recibo de pagamento');
 doc.setCreationDate(new Date(r.created_at));doc.setModificationDate(new Date(r.created_at));
 const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const page=doc.addPage([595.28,841.89]),navy=rgb(.035,.075,.15),ink=rgb(.09,.14,.22),muted=rgb(.36,.41,.49),cyan=rgb(0,.71,.88),light=rgb(.94,.96,.98),white=rgb(1,1,1);
 const clean=(v:unknown)=>Array.from(String(v??'').replace(/[\r\n\t]+/g,' ')).map(c=>{try{regular.encodeText(c);return c;}catch{return '';}}).join('');
 const text=(v:unknown,x:number,y:number,size=10,color=ink,font=regular)=>page.drawText(clean(v),{x,y,size,color,font});
 const lines=(v:unknown,x:number,y:number,width:number,size=10,font=regular,max=3)=>{let remaining=clean(v),count=0;while(remaining&&count<max){let n=remaining.length;while(n>0&&font.widthOfTextAtSize(remaining.slice(0,n),size)>width)n--;if(n<remaining.length){const space=remaining.lastIndexOf(' ',n);if(space>n/2)n=space;}let line=remaining.slice(0,n).trim();remaining=remaining.slice(n).trim();if(count===max-1&&remaining){while(font.widthOfTextAtSize(line+'...',size)>width)line=line.slice(0,-1);line+='...';}text(line,x,y-count*(size+5),size,ink,font);count++;}return count;};
 page.drawRectangle({x:0,y:690,width:595.28,height:152,color:navy});page.drawRectangle({x:0,y:686,width:595.28,height:4,color:cyan});
 const logo=await doc.embedPng(receiptLogo),dims=logo.scaleToFit(76,82);page.drawImage(logo,{x:40,y:737,width:dims.width,height:dims.height});
 text('Z-labs',135,791,24,white,bold);text('Laboratório de software',135,770,11,white);text('62.511.091 Pablo de Lima Boeira',135,745,9,white);text('CNPJ 62.511.091/0001-87',135,729,9,white);
 text('RECIBO DE PAGAMENTO',40,651,19,ink,bold);text(r.number,40,629,10,muted);text(sample?'MODELO / SEM VALOR':'PAGAMENTO CONFIRMADO',355,632,9,sample?muted:rgb(.05,.43,.29),bold);
 const recipient=s.recipient||{};
 page.drawRectangle({x:40,y:432,width:515.28,height:172,color:light});text('RECEBIDO DE',56,583,8,muted,bold);lines(recipient.legal_name||s.responsible||s.project,56,562,482,13,bold,2);
 if(recipient.tax_id)text(`${recipient.person_type==='pj'?'CNPJ':'CPF'}: ${formatTaxId(recipient.person_type||'pf',recipient.tax_id)}`,56,529,10);
 text('PROJETO / CLIENTE',56,507,8,muted,bold);lines(s.project,56,491,482,10,regular,1);
 const recipientAddress=[ [recipient.street,recipient.number].filter(Boolean).join(', '),recipient.complement,recipient.district,[recipient.city,recipient.state].filter(Boolean).join(' - '),recipient.zip?'CEP '+String(recipient.zip).replace(/^(\d{5})(\d{3})$/,'$1-$2'):''].filter(Boolean).join(' · ');
 if(recipientAddress)lines(recipientAddress,56,469,482,9,regular,2);

 const date=(v:string)=>new Date(v).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
 const due=String(s.due_date).split('-').reverse().join('/');
 const method=({pix:'Pix',pix_externo:'Pix recebido fora do link',dinheiro:'Dinheiro',transferencia:'Transferência bancária',cartao_externo:'Cartão por outro meio',credit_card:'Cartão de crédito',debit_card:'Cartão de débito',account_money:'Saldo Mercado Pago',outro:'Outro'}as Record<string,string>)[s.payment_method]||'Mercado Pago';
 text('REFERENTE A',40,410,8,muted,bold);lines(receiptDescription(s)+(s.billing_kind==='sale'&&s.monthly_amount_cents>0?' + mensalidade':''),40,392,510,12,bold,2);
 lines(s.plan||'',40,355,510,10,regular,2);
 text('VENCIMENTO',40,319,8,muted,bold);text(due,40,300,11);text('RECEBIDO EM',220,319,8,muted,bold);text(date(s.paid_at),220,300,11);text('FORMA DE PAGAMENTO',390,319,8,muted,bold);lines(method,390,300,165,10,regular,2);
 if(s.billing_kind==='sale'&&s.monthly_amount_cents>0){text(`Parcela: ${receiptMoney(s.installment_amount_cents)}   |   Mensalidade: ${receiptMoney(s.monthly_amount_cents)}`,40,280,10,muted);}
 page.drawRectangle({x:40,y:200,width:515.28,height:64,color:navy});text('VALOR RECEBIDO',58,238,9,white,bold);text(receiptMoney(s.amount_cents),58,216,22,white,bold);
 lines(`Recebemos o valor de ${receiptMoney(s.amount_cents)} referente à cobrança descrita neste recibo.`,40,174,515,10,regular,2);
 page.drawLine({start:{x:40,y:134},end:{x:555,y:134},thickness:.6,color:rgb(.81,.85,.89)});
 text('Z-labs Laboratório de software',40,114,10,ink,bold);text(`${s.address} - ${s.district}`,40,96,9,muted);text(`${s.city} | CEP ${s.zip}`,40,81,9,muted);
 text(`Emitido em ${date(r.created_at)} | ${r.number}`,40,50,8,muted);text('1 / 1',531,50,8,muted);
 if(sample)text('DADOS ILUSTRATIVOS - SEM VALOR DE QUITAÇÃO',40,16,9,muted,bold);
 return doc.save();
}
