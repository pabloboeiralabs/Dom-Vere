import{it,expect}from'vitest';
import{availabilityMessage,professionalDisplayName}from'../../supabase/functions/_shared/secretary-availability';
it('lists every free slot instead of selecting three',()=>{const slots=Array.from({length:18},(_,i)=>({professional_id:'p',professional_name:'Carlos Silva',date:'2026-10-19',time:`${String(8+Math.floor(i/4)).padStart(2,'0')}:${String((i%4)*15).padStart(2,'0')}`}));const text=availabilityMessage(slots,[{id:'p',name:'Carlos Silva'}]);expect(slots.every(s=>text.includes(s.time))).toBe(true);expect(text).toContain('Carlos —');expect(text).not.toContain('Carlos Silva');});
it('keeps surnames when two professionals have the same first name',()=>{const ps=[{name:'João Silva'},{name:'Joao Souza'}];expect(professionalDisplayName('João Silva',ps)).toBe('João Silva');expect(professionalDisplayName('Joao Souza',ps)).toBe('Joao Souza');});
it('formats custom header without duplication',()=>{
 const slots=[{professional_id:'p',professional_name:'Carlos',date:'2026-11-06',time:'09:00:00'}];
 const text=availabilityMessage(slots,[{id:'p',name:'Carlos'}],'');
 expect(text).not.toContain('A próxima disponibilidade é:');
 expect(text).not.toContain('Tenho estes horários livres:');
 expect(text).toContain('• 09:00');
});
