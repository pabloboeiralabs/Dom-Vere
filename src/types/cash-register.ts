// ============================================================
// CASH REGISTER TYPES
// ============================================================

export type PaymentMethod = 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'outro';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro', icon: '💵' },
  { value: 'pix', label: 'Pix', icon: '📱' },
  { value: 'cartao_credito', label: 'Crédito', icon: '💳' },
  { value: 'cartao_debito', label: 'Débito', icon: '🏧' },
  { value: 'outro', label: 'Outro', icon: '📋' },
];

// Cash Register Session
export interface CashRegisterSession {
  id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  expected_closing_balance: number | null;
  closing_balance: number | null;
  difference: number | null;
  status: 'open' | 'closed';
  notes: string | null;
  created_at: string;
}

// Cash Movement
export interface CashMovement {
  id: string;
  cash_register_id: string;
  user_id: string;
  type: 'entrada' | 'saida';
  category: 'recebimento' | 'troco' | 'sangria' | 'suprimento' | 'ajuste';
  amount: number;
  payment_method: PaymentMethod | null;
  payment_split_id: string | null;
  financial_entry_id: string | null;
  description: string | null;
  created_at: string;
}

// Payment Split
export interface PaymentSplit {
  id: string;
  financial_entry_id: string;
  payment_method: PaymentMethod;
  amount: number;
  cash_received: number | null;
  cash_change: number | null;
  created_at: string;
}

// Split Payment Input (for forms)
export interface SplitPaymentInput {
  payment_method: PaymentMethod;
  amount: number;
  cash_received?: number;
  cash_change?: number;
}

export const MOVEMENT_CATEGORIES: Record<string, { label: string; color: string }> = {
  recebimento: { label: 'Recebimento', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  troco: { label: 'Troco', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  sangria: { label: 'Sangria', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  suprimento: { label: 'Suprimento', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  ajuste: { label: 'Ajuste', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
};
