import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2';
import type {Database} from './database-schema.ts';
export type DatabaseClient=SupabaseClient<Database>;
export type DatabaseRow<K extends keyof Database['public']['Tables']>=Database['public']['Tables'][K]['Row'];
