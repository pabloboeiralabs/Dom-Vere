import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scissors, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate, Navigate } from "react-router-dom";

export default function BarberLogin() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const LOGIN_DOMAIN = "barber.local";

  if (user) {
    if (user.must_change_password) return <Navigate to="/change-password" replace />;
    return <Navigate to="/barber-panel" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) { setError("Preencha usuário e senha"); return; }
    setBusy(true);
    try {
      // Append domain to username for Supabase auth
      const email = `${username.toLowerCase().trim().replace(/\s+/g, ".")}@${LOGIN_DOMAIN}`;
      await login(email, password);
      navigate("/barber-panel", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Usuário ou senha inválidos");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#090D16] relative overflow-hidden p-4 theme-client">
      {/* Background ambient glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[250px] h-[250px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm z-10"
      >
        {/* Brand */}
        <div className="text-center mb-8 space-y-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", damping: 14 }}
            className="mx-auto h-20 w-20 rounded-3xl bg-gradient-to-br from-[#D4AF37] to-[#F3C06B] flex items-center justify-center shadow-2xl shadow-[#D4AF37]/20"
          >
            <Scissors className="h-10 w-10 text-[#090D16]" />
          </motion.div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Área do Profissional</h1>
            <p className="text-sm text-slate-400 mt-1">Acesse sua agenda e atendimentos</p>
          </div>
        </div>

        <Card className="border-white/[0.08] bg-[#131B2E]/60 backdrop-blur-xl shadow-2xl rounded-3xl">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-semibold text-slate-400">Usuário</Label>
                <Input
                  id="username" autoComplete="username"
                  placeholder="seu.usuario"
                  value={username} onChange={e => setUsername(e.target.value)}
                  className="rounded-xl h-11 bg-[#0E1322] border-white/[0.08] text-white placeholder-slate-500 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-400">Senha</Label>
                <Input
                  id="password" type="password" autoComplete="current-password"
                  placeholder="Sua senha"
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="rounded-xl h-11 bg-[#0E1322] border-white/[0.08] text-white placeholder-slate-500 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>
              {error && (
                <p className="text-sm text-red-400 bg-red-500/5 border border-red-500/10 p-3 rounded-xl">{error}</p>
              )}
              <Button type="submit" className="w-full rounded-xl h-11 bg-[#D4AF37] text-[#090D16] hover:bg-[#F3C06B] hover:shadow-lg hover:shadow-[#D4AF37]/10 active:scale-[0.98] transition-all font-bold mt-2" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500 mt-6 font-medium">
          Acesso exclusivo para profissionais
        </p>
      </motion.div>
    </div>
  );
}
