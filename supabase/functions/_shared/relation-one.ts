/** Normalize a singular PostgREST relationship and reject ambiguous ownership. */
export function relationOne<T>(value:T|T[]|null|undefined):T|null{
 if(Array.isArray(value)){if(value.length>1)throw Error('Relacionamento de cadastro ambíguo.');return value[0]??null;}
 return value??null;
}
