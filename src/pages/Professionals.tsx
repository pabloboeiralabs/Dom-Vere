import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { UserCheck, Plus, Pencil, Trash2, Clock, Camera, KeyRound, Loader2, MoreVertical, Eye, Power } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { ScheduleEditor } from "@/components/ScheduleEditor";

interface Professional {
  id: string;
  name: string;
  phone: string;
  commission_percent: number;
  active: boolean;
  photo_url: string | null;
}

interface Shift {
  enabled: boolean;
  start_time: string;
  end_time: string;
}

interface DaySchedule {
  dayIndex: number;
  manha: Shift;
  tarde: Shift;
  noturno: Shift;
}

interface ScheduleRow {
  id: string;
  professional_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const DEFAULT_SHIFTS: Omit<DaySchedule, 'dayIndex'> = {
  manha: { enabled: false, start_time: "08:00", end_time: "12:00" },
  tarde: { enabled: false, start_time: "13:00", end_time: "18:00" },
  noturno: { enabled: false, start_time: "18:00", end_time: "22:00" },
};

function rowsToDay(dayIndex: number, rows: ScheduleRow[]): DaySchedule {
  const dayRows = rows.filter(r => r.day_of_week === dayIndex && r.active);
  const day: DaySchedule = {
    dayIndex,
    manha: { ...DEFAULT_SHIFTS.manha },
    tarde: { ...DEFAULT_SHIFTS.tarde },
    noturno: { ...DEFAULT_SHIFTS.noturno },
  };
  for (const r of dayRows) {
    const start = r.start_time.substring(0, 5);
    const end = r.end_time.substring(0, 5);
    if (start < "12:00" && end <= "13:00") {
      day.manha = { enabled: true, start_time: start, end_time: end };
    } else if (start >= "12:00" && start < "18:00" && end <= "19:00") {
      day.tarde = { enabled: true, start_time: start, end_time: end };
    } else if (start >= "17:00") {
      day.noturno = { enabled: true, start_time: start, end_time: end };
    } else {
      // Legacy single-range: try to map
      if (start < "12:00") day.manha = { enabled: true, start_time: start, end_time: end < "13:00" ? end : "12:00" };
      if (end > "12:00" && start < "18:00") day.tarde = { enabled: true, start_time: start >= "12:00" ? start : "13:00", end_time: end <= "18:00" ? end : "18:00" };
      if (end > "18:00") day.noturno = { enabled: true, start_time: "18:00", end_time: end };
    }
  }
  return day;
}

function dayToRows(profId: string, day: DaySchedule): Omit<ScheduleRow, 'id'>[] {
  const rows: Omit<ScheduleRow, 'id'>[] = [];
  const shifts = [day.manha, day.tarde, day.noturno];
  for (const s of shifts) {
    if (s.enabled) {
      rows.push({ professional_id: profId, day_of_week: day.dayIndex, start_time: s.start_time, end_time: s.end_time, active: true });
    }
  }
  return rows;
}

export default function Professionals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [scheduleProfId, setScheduleProfId] = useState<string | null>(null);
  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>([]);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", commission_percent: 0 });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteProfId, setInviteProfId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [profAccounts, setProfAccounts] = useState<Record<string, { email: string }>>({});
  const [viewProf, setViewProf] = useState<Professional | null>(null);
  const [resetProfId, setResetProfId] = useState<string | null>(null);

  const loadProfessionals = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase.from("professionals").select("id, name, phone, commission_percent, active, photo_url").eq("user_id", user.id).order("name");
      setProfessionals((data || []) as Professional[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadProfessionals(); }, [loadProfessionals]);

  // Check which professionals already have accounts
  useEffect(() => {
    if (!user || professionals.length === 0) return;
    const checkAccounts = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("professional_id, email")
        .not("professional_id", "is", null);
      const map: Record<string, { email: string }> = {};
      (data || []).forEach((p: any) => { if (p.professional_id) map[p.professional_id] = { email: p.email }; });
      setProfAccounts(map);
    };
    checkAccounts();
  }, [user, professionals]);

  const handleInvite = async () => {
    if (!inviteProfId || !inviteEmail.trim()) return;
    const loginClean = inviteEmail.trim().toLowerCase().replace(/\s+/g, ".");
    if (loginClean.length < 3) {
      toast.error("Login deve ter pelo menos 3 caracteres");
      return;
    }
    setInviteLoading(true);
    try {
      // Garante token de sessão válido (evita 401 com token revogado)
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        await supabase.auth.refreshSession();
      }
      const { data, error } = await supabase.functions.invoke("create-professional-account", {
        body: { professional_id: inviteProfId, login: loginClean },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || "Conta criada!");
      setProfAccounts(prev => ({ ...prev, [inviteProfId]: { email: `${loginClean}@barber.local` } }));
      setInviteDialogOpen(false);
      setInviteEmail("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar conta");
    } finally {
      setInviteLoading(false);
    }
  };

  const compressImage = (file: File, maxSizeMB = 5): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const maxDim = 1200;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.8;
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error("Compression failed"));
              if (blob.size > maxSizeMB * 1024 * 1024 && quality > 0.1) {
                quality -= 0.1;
                tryCompress();
              } else {
                resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
              }
            },
            "image/jpeg",
            quality
          );
        };
        tryCompress();
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida");
      return;
    }
    // Sempre normalizar para JPEG (WhatsApp Carousel só renderiza JPG/PNG)
    let finalFile: File;
    try {
      finalFile = await compressImage(file);
    } catch {
      toast.error("Erro ao processar imagem");
      return;
    }
    setPhotoFile(finalFile);
    setPhotoPreview(URL.createObjectURL(finalFile));
  };

  const uploadPhoto = async (professionalId: string): Promise<string | null> => {
    if (!photoFile) return null;
    // Forçar .jpg para compatibilidade com WhatsApp Carousel
    const path = `${professionalId}.jpg`;
    
    const { error } = await supabase.storage
      .from("professionals")
      .upload(path, photoFile, { upsert: true, contentType: "image/jpeg" });
    
    if (error) {
      console.error("Upload error:", error);
      toast.error("Erro ao enviar foto");
      return null;
    }
    
    const { data: urlData } = supabase.storage.from("professionals").getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    setUploading(true);
    try {
      if (editing) {
        let photoUrl = editing.photo_url;
        if (photoFile) {
          const uploaded = await uploadPhoto(editing.id);
          if (uploaded) photoUrl = uploaded;
        }
        const { error } = await supabase.from("professionals").update({ 
          name: form.name.trim(), 
          phone: form.phone.trim(), 
          commission_percent: form.commission_percent,
          photo_url: photoUrl,
        }).eq("id", editing.id).eq("user_id", user.id);
        if (error) throw error;
        toast.success("Profissional atualizado");
      } else {
        const { data: inserted, error } = await supabase.from("professionals").insert({ 
          user_id: user.id, 
          name: form.name.trim(), 
          phone: form.phone.trim(), 
          commission_percent: form.commission_percent 
        }).select("id").single();
        if (error) throw error;
        
        if (photoFile && inserted) {
          const photoUrl = await uploadPhoto(inserted.id);
          if (photoUrl) {
            await supabase.from("professionals").update({ photo_url: photoUrl }).eq("id", inserted.id);
          }
        }
        toast.success("Profissional cadastrado");
      }
      setDialogOpen(false);
      setEditing(null);
      setForm({ name: "", phone: "", commission_percent: 0 });
      setPhotoFile(null);
      setPhotoPreview(null);
      loadProfessionals();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleToggleActive = async (p: Professional) => {
    if (!user) return;
    await supabase.from("professionals").update({ active: !p.active }).eq("id", p.id).eq("user_id", user.id);
    loadProfessionals();
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm("Excluir este profissional?")) return;
    await supabase.from("professionals").delete().eq("id", id).eq("user_id", user.id);
    toast.success("Profissional excluído");
    loadProfessionals();
  };

  const openEdit = (p: Professional) => {
    setEditing(p);
    setForm({ name: p.name, phone: p.phone || "", commission_percent: p.commission_percent });
    setPhotoPreview(p.photo_url || null);
    setPhotoFile(null);
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", phone: "", commission_percent: 0 });
    setPhotoPreview(null);
    setPhotoFile(null);
    setDialogOpen(true);
  };

  // Schedule management
  const openSchedule = (profId: string) => {
    setScheduleProfId(profId);
    setScheduleDialogOpen(true);
  };

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Profissionais</h1>
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">Novo Profissional</span><span className="sm:hidden">Novo</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : professionals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserCheck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-muted-foreground">Nenhum profissional cadastrado</p>
            <Button className="mt-4" onClick={openNew}>Cadastrar Profissional</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {professionals.map((p) => (
            <Card key={p.id} className={`border-border/50 ${!p.active ? "opacity-60" : ""}`}>
              <CardContent className="flex flex-row items-center justify-between py-4 px-4 sm:px-5 gap-3 cursor-pointer" onClick={() => navigate(`/professionals/${p.id}`)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="h-10 w-10 shrink-0 cursor-zoom-in" onClick={(e) => { e.stopPropagation(); if (p.photo_url) setZoomPhoto(p.photo_url); }}>
                    <AvatarImage src={p.photo_url || undefined} alt={p.name} className="object-cover" />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {getInitials(p.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{p.name}</span>
                      <Badge variant={p.active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                        {p.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                      {p.phone && <span>📱 {p.phone}</span>}
                      <span>💰 {p.commission_percent}%</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {profAccounts[p.id] && (
                    <Badge variant="outline" className="text-xs gap-1 hidden sm:inline-flex">
                      <KeyRound className="h-3 w-3" /> Login
                    </Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setViewProf(p)}>
                        <Eye className="h-4 w-4 mr-2" /> Visualizar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/professionals/${p.id}`)}>
                        <UserCheck className="h-4 w-4 mr-2" /> Detalhes
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openSchedule(p.id)}>
                        <Clock className="h-4 w-4 mr-2" /> Horários
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {profAccounts[p.id] ? (
                        <DropdownMenuItem onClick={() => setResetProfId(p.id)}>
                          <KeyRound className="h-4 w-4 mr-2" /> Resetar senha
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => { setInviteProfId(p.id); setInviteEmail(""); setInviteDialogOpen(true); }}>
                          <KeyRound className="h-4 w-4 mr-2" /> Criar login
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleToggleActive(p)}>
                        <Power className="h-4 w-4 mr-2" /> {p.active ? "Desativar" : "Ativar"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDelete(p.id)} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Visualizar profissional */}
      <Dialog open={!!viewProf} onOpenChange={(o) => !o && setViewProf(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Informações do Profissional</DialogTitle>
          </DialogHeader>
          {viewProf && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={viewProf.photo_url || undefined} alt={viewProf.name} className="object-cover" />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                    {getInitials(viewProf.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-lg font-semibold text-foreground">{viewProf.name}</div>
                  <Badge variant={viewProf.active ? "default" : "secondary"} className="mt-1">
                    {viewProf.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between border-b border-border/50 py-2">
                  <span className="text-muted-foreground">Telefone</span>
                  <span className="text-foreground">{viewProf.phone || "—"}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 py-2">
                  <span className="text-muted-foreground">Comissão</span>
                  <span className="text-foreground">{viewProf.commission_percent}%</span>
                </div>
                <div className="flex justify-between border-b border-border/50 py-2">
                  <span className="text-muted-foreground">Login de acesso</span>
                  <span className="text-foreground font-mono text-xs">
                    {profAccounts[viewProf.id]?.email
                      ? profAccounts[viewProf.id].email.replace(/@barber\.local$/, "")
                      : "Sem login"}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Status do login</span>
                  <span className="text-foreground">
                    {profAccounts[viewProf.id] ? "Ativo" : "Não criado"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => { setViewProf(null); openEdit(viewProf); }}>
                  <Pencil className="h-3 w-3 mr-1" /> Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => { const id = viewProf.id; setViewProf(null); openSchedule(id); }}>
                  <Clock className="h-3 w-3 mr-1" /> Horários
                </Button>
                {!profAccounts[viewProf.id] && (
                  <Button size="sm" variant="outline" onClick={() => { setInviteProfId(viewProf.id); setInviteEmail(""); setViewProf(null); setInviteDialogOpen(true); }}>
                    <KeyRound className="h-3 w-3 mr-1" /> Criar login
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset password confirmation */}
      <AlertDialog open={!!resetProfId} onOpenChange={(o) => !o && setResetProfId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar senha?</AlertDialogTitle>
            <AlertDialogDescription>
              A senha será redefinida para <strong>123456</strong>. O profissional será obrigado a alterar no próximo acesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              const pid = resetProfId;
              setResetProfId(null);
              if (!pid) return;
              try {
                const { data, error } = await supabase.functions.invoke("reset-professional-password", {
                  body: { professional_id: pid },
                });
                if (error) throw error;
                if (data?.error) throw new Error(data.error);
                toast.success("Senha resetada para 123456");
              } catch (err: any) {
                toast.error(err.message || "Erro ao resetar senha");
              }
            }}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Profissional" : "Novo Profissional"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Photo Upload */}
            <div className="flex flex-col items-center gap-3">
              <div 
                className="relative cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
              >
                <Avatar className="h-24 w-24 border-2 border-dashed border-muted-foreground/30 group-hover:border-primary transition-colors">
                  <AvatarImage src={photoPreview || undefined} alt="Foto" className="object-cover" />
                  <AvatarFallback className="bg-muted text-muted-foreground text-2xl">
                    {form.name ? getInitials(form.name) : <Camera className="h-8 w-8" />}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-6 w-6 text-white" />
                </div>
              </div>
              <button 
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => fileInputRef.current?.click()}
              >
                {photoPreview ? "Trocar foto" : "Adicionar foto"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />
            </div>

            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do profissional" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <Label>Comissão (%)</Label>
              <Input type="number" min={0} max={100} value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: Number(e.target.value) })} />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={uploading}>
              {uploading ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Horários de Trabalho</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            {scheduleProfId && <ScheduleEditor professionalId={scheduleProfId} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo Zoom Dialog */}
      <Dialog open={!!zoomPhoto} onOpenChange={() => setZoomPhoto(null)}>
        <DialogContent className="max-w-md p-2 bg-black/90 border-none">
          <img src={zoomPhoto || ""} alt="Foto do profissional" className="w-full h-auto rounded-lg object-contain max-h-[80vh]" />
        </DialogContent>
      </Dialog>

      {/* Invite Professional Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Login do Profissional</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Defina um login para o profissional. A senha padrão será <strong>123456</strong> e ele será obrigado a alterar no primeiro acesso.
          </p>
          <div className="space-y-4">
            <div>
              <Label>Login do Profissional</Label>
              <Input
                type="text"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="ex: pablo.boeira"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use nome.sobrenome ou apelido (sem espaços)
              </p>
            </div>
            <Button onClick={handleInvite} disabled={inviteLoading || !inviteEmail.trim()} className="w-full">
              {inviteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Login
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
