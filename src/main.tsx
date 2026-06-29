import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
