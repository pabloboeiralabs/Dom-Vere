import { useState } from "react";
import { useCashRegister } from "@/hooks/useCashRegister";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CashRegisterOpenDialog } from "@/components/CashRegisterOpenDialog";
import { CashRegisterCloseDialog } from "@/components/CashRegisterCloseDialog";
import { CashMovementDialog } from "@/components/CashMovementDialog";
import { MOVEMENT_CATEGORIES } from "@/types/cash-register";
import type { CashMovement } from "@/types/cash-register";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Receipt, ArrowDown, ArrowUp, History, Clock, Wallet, TrendingUp } from "lucide-react";

export default function Caixa() {
  const {
    session, loading, openRegister, closeRegister, movements,
    addMovement, sessionHistory, netCashChange, hasOpenSession,
  } = useCashRegister();

  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [viewingClosedSession, setViewingClosedSession] = useState<string | null>(null);

  const handleOpenRegister = async (balance: number) => {
    try {
      await openRegister(balance);
      toast.success("Caixa aberto com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao abrir caixa");
      throw e;
    }
  };

  const handleCloseRegister = async (counted: number, notes?: string) => {
    try {
      await closeRegister(counted, notes);
      toast.success("Caixa fechado com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao fechar caixa");
      throw e;
    }
  };

  const handleAddMovement = async (type: "sangria" | "suprimento", amount: number, desc?: string) => {
    try {
      await addMovement(type, amount, desc);
      toast.success(`${type === "sangria" ? "Sangria" : "Suprimento"} registrada!`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao registrar");
      throw e;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const closedSession = viewingClosedSession
    ? sessionHistory.find(s => s.id === viewingClosedSession)
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Caixa</h1>
          {hasOpenSession && (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              Aberto
            </Badge>
          )}
          {!hasOpenSession && !closedSession && (
            <Badge variant="secondary">Fechado</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasOpenSession ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setMovementDialogOpen(true)} className="gap-1">
                💸 Sangria / Suprimento
              </Button>
              <Button size="sm" onClick={() => setCloseDialogOpen(true)} className="gap-1">
                🔒 Fechar Caixa
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setOpenDialogOpen(true)} className="gap-1">
              🔓 Abrir Caixa
            </Button>
          )}
        </div>
      </div>

      {/* Session info banner */}
      {hasOpenSession && session && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2 text-sm text-emerald-400 mb-2">
            <Clock className="h-4 w-4" />
            <span>
              Aberto {formatDistanceToNow(new Date(session.opened_at), { locale: ptBR, addSuffix: true })}
              {" — "}
              {format(new Date(session.opened_at), "HH:mm", { locale: ptBR })}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Saldo Inicial</p>
              <p className="text-sm font-bold text-foreground">R$ {session.opening_balance.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Movimentação</p>
              <p className={`text-sm font-bold ${netCashChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {netCashChange >= 0 ? "+" : ""}R$ {netCashChange.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Saldo Esperado</p>
              <p className="text-sm font-bold text-foreground">
                R$ {(session.expected_closing_balance || 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Closed session info */}
      {closedSession && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                Caixa fechado em {format(new Date(closedSession.closed_at!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setViewingClosedSession(null)} className="text-xs">
              Voltar
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Saldo Inicial</p>
              <p className="text-sm font-bold">R$ {closedSession.opening_balance.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Esperado → Contado</p>
              <p className="text-sm font-bold">
                R$ {(closedSession.expected_closing_balance || 0).toFixed(2)} → R$ {(closedSession.closing_balance || 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Diferença</p>
              <p className={`text-sm font-bold ${(closedSession.difference || 0) > 0 ? "text-emerald-400" : (closedSession.difference || 0) < 0 ? "text-red-400" : ""}`}>
                {closedSession.difference && closedSession.difference > 0 ? "+" : ""}R$ {(closedSession.difference || 0).toFixed(2)}
              </p>
            </div>
          </div>
          {closedSession.notes && (
            <p className="text-xs text-muted-foreground mt-2">Obs: {closedSession.notes}</p>
          )}
        </div>
      )}

      {/* Summary cards */}
      {hasOpenSession && session && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Wallet className="h-5 w-5 text-blue-400 mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">Abertura</p>
              <p className="text-lg font-bold">R$ {session.opening_balance.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <ArrowUp className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">Entradas</p>
              <p className="text-lg font-bold text-emerald-400">
                R$ {movements.filter(m => m.type === "entrada").reduce((s, m) => s + m.amount, 0).toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <ArrowDown className="h-5 w-5 text-red-400 mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">Saídas</p>
              <p className="text-lg font-bold text-red-400">
                R$ {movements.filter(m => m.type === "saida").reduce((s, m) => s + m.amount, 0).toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">Saldo Esperado</p>
              <p className="text-lg font-bold">
                R$ {(session.expected_closing_balance || 0).toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Movements table */}
      {(hasOpenSession || closedSession) && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Movimentações do Caixa
              </h3>
              <span className="text-xs text-muted-foreground">{movements.length} registro(s)</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {movements.length === 0 ? (
                <div className="text-center py-12">
                  <Receipt className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma movimentação ainda</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">
                    Os recebimentos em dinheiro aparecerão aqui automaticamente
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/20 text-[10px] text-muted-foreground uppercase">
                      <th className="text-left py-2 px-4">Tipo</th>
                      <th className="text-left py-2 px-4">Categoria</th>
                      <th className="text-right py-2 px-4">Valor</th>
                      <th className="text-left py-2 px-4 hidden sm:table-cell">Descrição</th>
                      <th className="text-right py-2 px-4 hidden sm:table-cell">Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m: CashMovement) => {
                      const cat = MOVEMENT_CATEGORIES[m.category] || { label: m.category, color: "" };
                      return (
                        <tr key={m.id} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-1.5">
                              {m.type === "entrada" ? (
                                <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5 text-red-400" />
                              )}
                              <span className="text-xs text-foreground">
                                {m.type === "entrada" ? "Entrada" : "Saída"}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <Badge className={`text-[10px] px-1.5 py-0 ${cat.color}`}>
                              {cat.label}
                            </Badge>
                          </td>
                          <td className={`py-2.5 px-4 text-right text-xs font-bold ${
                            m.type === "entrada" ? "text-emerald-400" : "text-red-400"
                          }`}>
                            {m.type === "entrada" ? "+" : "-"} R$ {m.amount.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-4 text-xs text-muted-foreground hidden sm:table-cell max-w-[200px] truncate">
                            {m.description || "—"}
                          </td>
                          <td className="py-2.5 px-4 text-right text-[10px] text-muted-foreground hidden sm:table-cell">
                            {format(new Date(m.created_at), "HH:mm", { locale: ptBR })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session history */}
      {!hasOpenSession && !closedSession && sessionHistory.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-border/30">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                Histórico de Caixas
              </h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {sessionHistory.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setViewingClosedSession(s.id)}
                  className="w-full text-left px-4 py-3 border-b border-border/10 hover:bg-muted/20 transition-colors flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {format(new Date(s.closed_at || s.opened_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Aberto às {format(new Date(s.opened_at), "HH:mm")} — Fechado às {s.closed_at ? format(new Date(s.closed_at), "HH:mm") : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">
                      R$ {(s.closing_balance || 0).toFixed(2)}
                    </p>
                    {(s.difference || 0) !== 0 && (
                      <p className={`text-[10px] ${(s.difference || 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {(s.difference || 0) > 0 ? "+" : ""}R$ {(s.difference || 0).toFixed(2)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No sessions at all */}
      {!hasOpenSession && !closedSession && sessionHistory.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Nenhum caixa foi aberto ainda</p>
            <p className="text-sm text-muted-foreground mb-4">
              Abra o caixa para começar a registrar as movimentações do dia
            </p>
            <Button onClick={() => setOpenDialogOpen(true)} className="gap-1">
              🔓 Abrir Caixa
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <CashRegisterOpenDialog
        open={openDialogOpen}
        onOpenChange={setOpenDialogOpen}
        onConfirm={handleOpenRegister}
      />
      {session && (
        <CashRegisterCloseDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          session={session}
          onConfirm={handleCloseRegister}
        />
      )}
      <CashMovementDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        onConfirm={handleAddMovement}
      />
    </div>
  );
}
