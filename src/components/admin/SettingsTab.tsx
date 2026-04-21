import { useState, useRef, ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Palette, Building2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";

// Converte hex para "h s% l%"
const hexToHsl = (hex: string) => {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return "";
  const [r, g, b] = m.map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const hslToHex = (hsl: string) => {
  const m = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!m) return "#e63e7c";
  const h = parseInt(m[1]) / 360, s = parseInt(m[2]) / 100, l = parseInt(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const SettingsTab = () => {
  const { settings, reload } = useSettings();
  const [brandName, setBrandName] = useState(settings.brand_name);
  const [unitName, setUnitName] = useState(settings.unit_name);
  const [primaryHex, setPrimaryHex] = useState(hslToHex(settings.primary_color));
  const [secondaryHex, setSecondaryHex] = useState(hslToHex(settings.secondary_color));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveAll = async () => {
    setSaving(true);
    const updates = [
      { key: "brand_name", value: JSON.stringify(brandName) },
      { key: "unit_name", value: JSON.stringify(unitName) },
      { key: "primary_color", value: JSON.stringify(hexToHsl(primaryHex)) },
      { key: "secondary_color", value: JSON.stringify(hexToHsl(secondaryHex)) },
    ];
    for (const u of updates) {
      const { error } = await supabase
        .from("settings")
        .upsert({ key: u.key, value: JSON.parse(u.value) }, { onConflict: "key" });
      if (error) { toast.error("Erro ao salvar", { description: error.message }); setSaving(false); return; }
    }
    setSaving(false);
    toast.success("Configurações salvas");
    reload();
  };

  const onLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `logo.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("branding")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { toast.error("Erro no upload", { description: upErr.message }); setUploading(false); return; }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    const { error: setErr } = await supabase
      .from("settings")
      .upsert({ key: "logo_url", value: url }, { onConflict: "key" });
    setUploading(false);
    if (setErr) { toast.error("Erro ao salvar URL", { description: setErr.message }); return; }
    toast.success("Logo atualizada");
    reload();
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Configurações do Sistema</h2>
        <p className="text-muted-foreground text-sm">Apenas Super Admin pode alterar</p>
      </div>

      {/* Identidade */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Identidade</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nome da marca</Label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Afya" />
          </div>
          <div className="space-y-2">
            <Label>Nome da unidade</Label>
            <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Unidade Principal" />
          </div>
        </div>
      </div>

      {/* Logo */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <ImageIcon className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Logo</h3>
        </div>
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-2xl glass flex items-center justify-center overflow-hidden">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-10 h-10 text-muted-foreground" />
            )}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogoChange} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} variant="outline">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Enviar nova logo
            </Button>
            <p className="text-xs text-muted-foreground mt-2">PNG, JPG ou SVG. Recomendado 256×256.</p>
          </div>
        </div>
      </div>

      {/* Cores */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Palette className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Cores Globais</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Cor primária</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryHex}
                onChange={(e) => setPrimaryHex(e.target.value)}
                className="w-16 h-12 rounded-lg border border-border cursor-pointer bg-transparent"
              />
              <Input value={primaryHex} onChange={(e) => setPrimaryHex(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cor secundária</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={secondaryHex}
                onChange={(e) => setSecondaryHex(e.target.value)}
                className="w-16 h-12 rounded-lg border border-border cursor-pointer bg-transparent"
              />
              <Input value={secondaryHex} onChange={(e) => setSecondaryHex(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <div className="flex-1 h-12 rounded-lg gradient-brand shadow-brand" />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={saveAll} disabled={saving} size="lg" className="gradient-brand border-0 shadow-brand">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
};

export default SettingsTab;
