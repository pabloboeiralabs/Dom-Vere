import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Fix: PostgrestBuilder (used by supabase .insert()) tem .then() mas nao .catch()
// Isso causa erro "catch is not a function"
import { createClient } from '@supabase/supabase-js';
try {
  const c = createClient('https://localhost', 'x');
  const b = c.from('t').insert({});
  let p = Object.getPrototypeOf(b);
  while (p && p.constructor?.name !== 'PostgrestBuilder') p = Object.getPrototypeOf(p);
  if (p && !p.catch) {
    p.catch = function(this: any, onrejected: any) { return this.then().catch(onrejected); };
    p.finally = function(this: any, onFinally: any) { return this.then().finally(onFinally); };
  }
} catch(_) {}

// Force unregister old service workers to prevent stale cache on deploy
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) {
      reg.unregister();
    }
  });
}

console.log("APP BOOTSTRAP STARTED");
createRoot(document.getElementById("root")!).render(<App />);
