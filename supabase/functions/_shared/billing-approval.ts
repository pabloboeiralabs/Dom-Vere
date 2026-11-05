export function matchesBillingApproval(invoice: {id?:string;tenant_id?:string;status?:string;replaced_at?:string|null;amount_cents?:number;due_date?:string;plan_name?:string;tenant?:{name?:string;contact_name?:string;contact_phone?:string}}, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const expected=input as Record<string,unknown>;
  const tenant = invoice?.tenant;
  let phone = String(tenant?.contact_phone || '').replace(/\D/g, '');
  if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
  return invoice?.status === 'open' && invoice.replaced_at === null &&
    typeof expected.amountCents==='number' && Number.isSafeInteger(expected.amountCents) && expected.amountCents > 0 &&
    typeof expected.phone === 'string' && /^55[1-9]\d{9,10}$/.test(expected.phone) &&
    expected.invoiceId === invoice.id && expected.tenantId === invoice.tenant_id &&
    expected.amountCents === invoice.amount_cents && expected.dueDate === invoice.due_date &&
    expected.planName === invoice.plan_name && expected.projectName === tenant?.name &&
    expected.contactName === tenant?.contact_name && expected.phone === phone;
}
