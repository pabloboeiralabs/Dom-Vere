import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Fix: PostgrestFilterBuilder (returned by .insert()) tem .then() mas nao .catch()
// Isso causa erro "catch is not a function" em alguns casos.
// Adicionamos .catch() dinamicamente via prototype walk
(function fixPostgrestCatch() {
  const testClient = createClient('https://localhost', 'key');
  const builder = testClient.from('test').insert({});
  let proto = Object.getPrototypeOf(builder);
  while (proto && proto.constructor?.name !== 'PostgrestBuilder') {
    proto = Object.getPrototypeOf(proto);
  }
  if (proto && !proto.catch) {
    proto.catch = function(onrejected: any) {
      return this.then().catch(onrejected);
    };
  }
})();

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});