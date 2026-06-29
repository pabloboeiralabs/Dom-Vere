import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Fix: PostgrestBuilder (used by supabase .insert()) tem .then() mas nao .catch()
import { createClient } from '@supabase/supabase-js';
if (typeof createClient === 'function') {
  try {
    const _c = createClient('https://localhost', 'x');
    const _b = _c.from('t').insert({});
    let _p = Object.getPrototypeOf(_b);
    while (_p && _p.constructor?.name !== 'PostgrestBuilder') _p = Object.getPrototypeOf(_p);
    if (_p && !_p.catch) {
      _p.catch = function(this: any, onrejected: any) { return this.then().catch(onrejected); };
      _p.finally = function(this: any, onFinally: any) { return this.then().finally(onFinally); };
    }
  } catch(_) {}
}

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
