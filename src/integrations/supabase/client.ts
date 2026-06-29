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

// Fix: todos os builders do Supabase tem .then() mas nao .catch()
// Isso faz com que .insert().catch() de erro "catch is not a function"
// Adicionamos .catch() e .finally() diretamente no prototype apos criar o client
try {
  const testBuilder = supabase.from('_fix').insert({});
  let proto = Object.getPrototypeOf(testBuilder);
  while (proto && proto.constructor?.name !== 'PostgrestBuilder') {
    proto = Object.getPrototypeOf(proto);
  }
  if (proto && !proto.catch) {
    proto.catch = function(onrejected: any) { return this.then().catch(onrejected); };
    proto.finally = function(onFinally: any) { return this.then().finally(onFinally); };
  }
} catch(_) {}

export { supabase };
