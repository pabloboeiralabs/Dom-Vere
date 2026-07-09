import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { UserCheck, Plus, Pencil, Trash2, Camera, KeyRound, Loader2, MoreVertical, ClipboardList } from "lucide-react";
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

export default function Professionals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", commission_percent: 0, active: true });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Login creation / credentials states
  const [createLoginToggle, setCreateLoginToggle] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [profAccounts, setProfAccounts] = useState<Record<string, { email: string }>>({});
  const [activeTab, setActiveTab] = useState("profile");

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

  // Fetch accounts mapped to professionals
  const checkAccounts = useCallback(async () => {
    if (!user || professionals.length === 0) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("professional_id, email")
        .not("professional_id", "is", null);
      const map: Record<string, { email: string }> = {};
      (data || []).forEach((p: any) => { if (p.professional_id) map[p.professional_id] = { email: p.email }; });
      setProfAccounts(map);
    } catch (e) {
      console.error(e);
    }
  }, [user, professionals]);

  useEffect(() => {
    checkAccounts();
  }, [checkAccounts]);

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
      let finalProfId = "";
      
      if (editing) {
        finalProfId = editing.id;
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
          active: form.active,
        }).eq("id", editing.id).eq("user_id", user.id);
        if (error) throw error;
        toast.success("Profissional atualizado");
      } else {
        const { data: inserted, error } = await supabase.from("professionals").insert({ 
          user_id: user.id, 
          name: form.name.trim(), 
          phone: form.phone.trim(), 
          commission_percent: form.commission_percent,
          active: true
        }).select("id").single();
        if (error) throw error;
        finalProfId = inserted.id;
        
        if (photoFile) {
          const photoUrl = await uploadPhoto(finalProfId);
          if (photoUrl) {
            await supabase.from("professionals").update({ photo_url: photoUrl }).eq("id", finalProfId);
          }
        }

        // Insert default schedule (Segunda a Sexta 08h-12h e 13h-18h, Sábado 08h-12h)
        const defaultSchedules = [
          ...[1, 2, 3, 4, 5].flatMap(day => [
            { professional_id: finalProfId, day_of_week: day, start_time: "08:00:00", end_time: "12:00:00", active: true },
            { professional_id: finalProfId, day_of_week: day, start_time: "13:00:00", end_time: "18:00:00", active: true }
          ]),
          { professional_id: finalProfId, day_of_week: 6, start_time: "08:00:00", end_time: "12:00:00", active: true }
        ];
        await supabase.from("professional_schedules").insert(defaultSchedules);
        
        toast.success("Profissional cadastrado com horários padrão!");
      }

      // Create login account if input is filled and they don't have an account yet
      if (!profAccounts[finalProfId] && inviteEmail.trim()) {
        const loginClean = inviteEmail.trim().toLowerCase().replace(/\s+/g, ".");
        if (loginClean.length < 3) {
          toast.error("O login deve ter pelo menos 3 caracteres.");
        } else {
          setInviteLoading(true);
          const { data, error: inviteErr } = await supabase.functions.invoke("create-professional-account", {
            body: { professional_id: finalProfId, login: loginClean },
          });
          if (inviteErr) {
            toast.error("Erro ao criar conta de acesso: " + inviteErr.message);
          } else if (data?.error) {
            toast.error("Erro ao criar conta de acesso: " + data.error);
          } else {
            toast.success(`Conta de acesso criada: ${loginClean}@barber.local`);
            setProfAccounts(prev => ({ ...prev, [finalProfId]: { email: `${loginClean}@barber.local` } }));
          }
          setInviteLoading(false);
        }
      }

      if (!editing) {
        // Load the new list of professionals
        await loadProfessionals();
        
        // Find the new professional to load their details in edit view
        const response = await supabase.from("professionals").select("id, name, phone, commission_percent, active, photo_url").eq("id", finalProfId).maybeSingle();
        if (response.data) {
          setEditing(response.data as Professional);
        } else {
          setEditing({
            id: finalProfId,
            name: form.name.trim(),
            phone: form.phone.trim(),
            commission_percent: form.commission_percent,
            active: true,
            photo_url: null
          });
        }
        
        // Switch dialog to schedule tab
        setForm(prev => ({ ...prev, active: true }));
        setCreateLoginToggle(false);
        setInviteEmail("");
        setActiveTab("schedule");
      } else {
        setDialogOpen(false);
        setEditing(null);
        setForm({ name: "", phone: "", commission_percent: 0, active: true });
        setPhotoFile(null);
        setPhotoPreview(null);
        setCreateLoginToggle(false);
        setInviteEmail("");
        loadProfessionals();
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleResetPassword = async (pid: string) => {
    if (!confirm("Deseja realmente resetar a senha deste profissional para 123456? Ele será obrigado a alterá-la no próximo acesso.")) return;
    setInviteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-professional-password", {
        body: { professional_id: pid },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Senha resetada para 123456!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao resetar senha");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm("Excluir este profissional?")) return;
    try {
      await supabase.from("professionals").delete().eq("id", id).eq("user_id", user.id);
      toast.success("Profissional excluído");
      loadProfessionals();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openEdit = (p: Professional) => {
    setEditing(p);
    setForm({ name: p.name, phone: p.phone || "", commission_percent: p.commission_percent, active: p.active });
    setPhotoPreview(p.photo_url || null);
    setPhotoFile(null);
    setCreateLoginToggle(false);
    setInviteEmail("");
    setActiveTab("profile");
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", phone: "", commission_percent: 0, active: true });
    setPhotoPreview(null);
    setPhotoFile(null);
    setCreateLoginToggle(false);
    setInviteEmail("");
    setActiveTab("profile");
    setDialogOpen(true);
  };

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Profissionais</h1>
        <Button onClick={openNew} size="sm" className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">Novo Profissional</span><span className="sm:hidden">Novo</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : professionals.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <UserCheck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-muted-foreground">Nenhum profissional cadastrado</p>
            <Button className="mt-4 rounded-xl" onClick={openNew}>Cadastrar Profissional</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {professionals.map((p) => (
            <Card key={p.id} className={`border-border/50 transition-all ${!p.active ? "opacity-60 bg-muted/20" : ""}`}>
              <CardContent className="flex flex-row items-center justify-between py-4 px-4 sm:px-5 gap-3 cursor-pointer" onClick={() => openEdit(p)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="h-12 w-12 shrink-0 cursor-zoom-in" onClick={(e) => { e.stopPropagation(); if (p.photo_url) setZoomPhoto(p.photo_url); }}>
                    <AvatarImage src={p.photo_url || undefined} alt={p.name} className="object-cover" />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {getInitials(p.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{p.name}</span>
                      <Badge variant={p.active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0.5 rounded-md font-medium">
                        {p.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      {p.phone && <span>📱 {p.phone}</span>}
                      <span>💰 {p.commission_percent}% comissão</span>
                    </div>
                  </div>
                </div>
                
                {/* 3 dots action menu */}
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {profAccounts[p.id] && (
                    <Badge variant="outline" className="text-[10px] gap-1 hidden sm:inline-flex bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400">
                      <KeyRound className="h-3 w-3" /> Acesso Ativo
                    </Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl">
                      <DropdownMenuItem onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar / Acesso
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/professionals/${p.id}`)}>
                        <ClipboardList className="h-4 w-4 mr-2" /> Atendimentos e Histórico
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

      {/* Photo Zoom Dialog */}
      <Dialog open={!!zoomPhoto} onOpenChange={() => setZoomPhoto(null)}>
        <DialogContent className="max-w-md p-2 bg-black/90 border-none">
          <img src={zoomPhoto || ""} alt="Foto do profissional" className="w-full h-auto rounded-lg object-contain max-h-[80vh]" />
        </DialogContent>
      </Dialog>

      {/* Create/Edit Unified Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={editing ? "max-w-2xl rounded-2xl" : "max-w-md rounded-2xl"}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editing ? `Editar Profissional: ${editing.name}` : "Novo Profissional"}
            </DialogTitle>
          </DialogHeader>

          {editing ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-2 mb-4 bg-muted/50 p-1 rounded-xl">
                <TabsTrigger value="profile" className="rounded-lg py-1.5 font-semibold text-sm">Dados e Acesso</TabsTrigger>
                <TabsTrigger value="schedule" className="rounded-lg py-1.5 font-semibold text-sm">Horários de Trabalho</TabsTrigger>
              </TabsList>
              
              <TabsContent value="profile" className="space-y-4 pt-1">
                {/* Photo Upload */}
                <div className="flex flex-col items-center gap-2">
                  <div 
                    className="relative cursor-pointer group"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Avatar className="h-20 w-20 border border-border group-hover:border-primary transition-colors">
                      <AvatarImage src={photoPreview || undefined} alt="Foto" className="object-cover" />
                      <AvatarFallback className="bg-muted text-muted-foreground text-xl font-bold">
                        {form.name ? getInitials(form.name) : <Camera className="h-6 w-6" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="h-5 w-5 text-white" />
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase">Nome *</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do profissional" className="rounded-xl mt-1 h-10" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase">Telefone</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" className="rounded-xl mt-1 h-10" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 items-center">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase">Comissão (%)</Label>
                    <Input type="number" min={0} max={100} value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: Number(e.target.value) })} className="rounded-xl mt-1 h-10" />
                  </div>
                  <div className="flex items-center justify-between border border-border/50 rounded-xl p-3 bg-muted/20 h-11 mt-5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase cursor-pointer" htmlFor="edit-active">Profissional Ativo</Label>
                    <Switch
                      id="edit-active"
                      checked={form.active}
                      onCheckedChange={(checked) => setForm({ ...form, active: checked })}
                    />
                  </div>
                </div>

                {/* Account Access sub-section */}
                <div className="border-t border-border/30 pt-4 mt-2">
                  <h3 className="text-sm font-bold text-foreground mb-3">E-Mail de Acesso para o PWA</h3>
                  {profAccounts[editing.id] ? (
                    <div className="bg-muted/40 border border-border/30 rounded-xl p-3.5 flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">E-mail de acesso para o PWA</p>
                        <p className="text-sm font-mono text-foreground font-semibold">{profAccounts[editing.id].email}</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetPassword(editing.id)}
                        disabled={inviteLoading}
                        className="rounded-lg text-xs gap-1.5 h-9 shrink-0 border-border"
                      >
                        {inviteLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                        Resetar Senha
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 bg-muted/20 border border-border/30 rounded-xl p-4">
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground uppercase">Criar E-mail de Acesso (Login / Usuário)</Label>
                        <Input
                          type="text"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="ex: nome.sobrenome"
                          className="rounded-xl mt-1.5 h-10 bg-background"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Insira um nome de usuário (ex: fulano.silva) para gerar o e-mail de acesso.
                        </p>
                        {inviteEmail.trim() && (
                          <div className="mt-3 p-3 bg-background rounded-lg text-xs space-y-1.5 border border-border/30">
                            <p className="font-semibold text-foreground">Credenciais que serão criadas:</p>
                            <p className="text-muted-foreground">
                              📧 <strong>E-mail de acesso:</strong> <span className="font-mono text-primary font-bold">{inviteEmail.trim().toLowerCase().replace(/\s+/g, ".")}@barber.local</span>
                            </p>
                            <p className="text-muted-foreground">
                              🔑 <strong>Senha padrão:</strong> <span className="font-mono font-bold">123456</span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <Button onClick={handleSave} className="w-full rounded-xl h-11 text-base font-semibold" disabled={uploading || inviteLoading}>
                    {uploading ? "Salvando..." : "Salvar Alterações"}
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="schedule" className="pt-1">
                <div className="max-h-[60vh] overflow-y-auto pr-1">
                  <ScheduleEditor professionalId={editing.id} />
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="space-y-4 pt-1">
              {/* Photo Upload */}
              <div className="flex flex-col items-center gap-2">
                <div 
                  className="relative cursor-pointer group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Avatar className="h-20 w-20 border border-border group-hover:border-primary transition-colors">
                    <AvatarImage src={photoPreview || undefined} alt="Foto" className="object-cover" />
                    <AvatarFallback className="bg-muted text-muted-foreground text-xl font-bold">
                      <Camera className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-5 w-5 text-white" />
                  </div>
                </div>
                <button 
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Adicionar foto
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
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do profissional" className="rounded-xl mt-1 h-10" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase">Telefone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" className="rounded-xl mt-1 h-10" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase">Comissão (%)</Label>
                  <Input type="number" min={0} max={100} value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: Number(e.target.value) })} className="rounded-xl mt-1 h-10" />
                </div>
              </div>

              {/* Login creation panel (Always visible) */}
              <div className="space-y-3 bg-muted/20 border border-border/30 rounded-xl p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">E-mail de Acesso para o PWA (Opcional)</h3>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Nome de Usuário / Login</Label>
                  <Input
                    type="text"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="ex: nome.sobrenome"
                    className="rounded-xl mt-1.5 h-10 bg-background"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Insira um nome de usuário (ex: fulano.silva) para gerar o e-mail de acesso.
                  </p>
                  {inviteEmail.trim() && (
                    <div className="mt-3 p-3 bg-background rounded-lg text-xs space-y-1.5 border border-border/30">
                      <p className="font-semibold text-foreground">Credenciais para login no aplicativo PWA:</p>
                      <p className="text-muted-foreground">
                        📧 <strong>E-mail de acesso:</strong> <span className="font-mono text-primary font-bold">{inviteEmail.trim().toLowerCase().replace(/\s+/g, ".")}@barber.local</span>
                      </p>
                      <p className="text-muted-foreground">
                        🔑 <strong>Senha padrão:</strong> <span className="font-mono font-bold">123456</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <Button onClick={handleSave} className="w-full rounded-xl h-11 text-base font-semibold" disabled={uploading || inviteLoading}>
                  {uploading ? "Salvando..." : "Cadastrar Profissional"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
