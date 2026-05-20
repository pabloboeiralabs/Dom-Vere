import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Scissors, Loader2 } from "lucide-react";
import { toast } from "sonner";

const LOGIN_DOMAIN = "barber.local";

function normalizeLogin(input: string): string {
  const trimmed = input.toLowerCase().trim();
  // If it looks like an email, use as-is
  if (trimmed.includes("@")) return trimmed;
  // Otherwise treat as username and append domain
  return `${trimmed}@${LOGIN_DOMAIN}`;
}

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [isForgot, setIsForgot] = useState(false);

  if (user) {
    console.log("LOGIN PAGE REDIRECT TRIGGERED", user);
    if (user.must_change_password) return <Navigate to="/change-password" replace />;
    const dest = user.role === "profissional" ? "/professional-panel" : "/dashboard";
    console.log("DESTINATION:", dest);
    return <Navigate to={dest} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isForgot) {
        const normalizedEmail = normalizeLogin(email);
        const { error } = await (await import("@/integrations/supabase/client")).supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Email de redefinição enviado! Verifique sua caixa de entrada.");
        setIsForgot(false);
      } else if (isRegister) {
        if (!name.trim()) {
          toast.error("Informe seu nome");
          setLoading(false);
          return;
        }
        await register(email, password, name);
        toast.success("Conta criada com sucesso!");
      } else {
        const normalizedEmail = normalizeLogin(email);
        await login(normalizedEmail, password);
        toast.success("Login realizado!");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl border-border/50">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Scissors className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            {isForgot ? "Recuperar Senha" : isRegister ? "Criar Conta" : "Entrar"}
          </CardTitle>
          <CardDescription>
            {isForgot ? "Informe seu email para receber o link de redefinição" : isRegister ? "Preencha os dados para criar sua conta" : "Acesse com seu login ou email"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && !isForgot && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{isRegister ? "Email" : "Login ou Email"}</Label>
              <Input
                id="email"
                type={isRegister ? "email" : "text"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isRegister ? "email@exemplo.com" : "seu.login ou email@exemplo.com"}
                required
              />
              {!isRegister && !isForgot && (
                <p className="text-xs text-muted-foreground">
                  Profissionais: use o login criado pela barbearia
                </p>
              )}
            </div>
            {!isForgot && (
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isForgot ? "Enviar Link" : isRegister ? "Criar Conta" : "Entrar"}
            </Button>
            {!isRegister && !isForgot && (
              <p className="text-sm text-center">
                <button type="button" className="text-primary underline" onClick={() => setIsForgot(true)}>Esqueci minha senha</button>
              </p>
            )}
            {isForgot && (
              <p className="text-sm text-center">
                <button type="button" className="text-primary underline" onClick={() => setIsForgot(false)}>Voltar ao login</button>
              </p>
            )}
            <p className="text-sm text-center text-muted-foreground">
              {isRegister ? "Já tem conta?" : "Não tem conta?"}{" "}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => setIsRegister(!isRegister)}
              >
                {isRegister ? "Entrar" : "Criar conta"}
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
