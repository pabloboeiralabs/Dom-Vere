import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Fix: PostgrestFilterBuilder/Builder tem .then() mas nao .catch()
// Isso causa erro "catch is not a function"
// Adicionamos .catch() dinamicamente
const origFrom = supabase.from.bind(supabase);
supabase.from = ((table: string) => {
  const builder = origFrom(table);
  const origInsert = builder.insert.bind(builder);
  builder.insert = (values: any) => {
    const result = origInsert(values);
    if (!result.catch) {
      result.catch = (onrejected: any) => result.then().catch(onrejected);
    }
    if (!result.finally) {
      result.finally = (onFinally: any) => result.then().finally(onFinally);
    }
    return result;
  };
  return builder;
}) as any;

export { supabase };
