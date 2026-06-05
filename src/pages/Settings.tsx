import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check } from 'lucide-react';
import { fetcher, putter } from '@/lib/fetcher';

type Workspace = {
  id: string;
  name: string;
  meta_pixel_id?: string | null;
  meta_capi_token?: string | null;
  google_ads_id?: string | null;
  gtm_id?: string | null;
  webhook_url?: string | null;
  uazapi_url?: string | null;
  uazapi_admin_token?: string | null;
};

export function Settings() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetcher('/workspace').then(setWs).finally(() => setLoading(false));
  }, []);

  const update = (k: keyof Workspace, v: string) => setWs((w) => w ? { ...w, [k]: v } : w);

  const save = async () => {
    if (!ws) return;
    setSaving(true);
    await putter('/workspace', ws);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading || !ws) return <div className="text-gray-500">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1">Credenciais do workspace para envio de eventos.</p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Nome e identificação.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={ws.name} onChange={(e) => update('name', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>uazapi (WhatsApp)</CardTitle>
          <CardDescription>Configure 1x. Usado por todos os números do workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Server URL</Label>
            <Input value={ws.uazapi_url || ''} onChange={(e) => update('uazapi_url', e.target.value)} placeholder="https://sua-instancia.uazapi.com" />
          </div>
          <div className="space-y-2">
            <Label>Admin Token</Label>
            <Input type="password" value={ws.uazapi_admin_token || ''} onChange={(e) => update('uazapi_admin_token', e.target.value)} placeholder="admintoken da sua conta uazapi" />
            <p className="text-xs text-muted-foreground">Token de administrador do painel uazapi (cria/gerencia instâncias).</p>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Meta Pixel + Conversions API</CardTitle>
          <CardDescription>Pixel ID + Access Token (Business Settings › Datasets). Injetados automaticamente na landing page dos rotadores.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Meta Pixel ID</Label>
            <Input value={ws.meta_pixel_id || ''} onChange={(e) => update('meta_pixel_id', e.target.value)} placeholder="123456789012345" />
            <p className="text-xs text-muted-foreground">Dispara ViewContent client-side na landing page.</p>
          </div>
          <div className="space-y-2">
            <Label>CAPI Access Token</Label>
            <Input type="password" value={ws.meta_capi_token || ''} onChange={(e) => update('meta_capi_token', e.target.value)} placeholder="EAAxxxxxxx..." />
            <p className="text-xs text-muted-foreground">Dispara ViewContent server-side (CAPI) na landing page — mais preciso, não depende do browser.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Google Tag Manager</CardTitle>
          <CardDescription>Container GTM injetado na landing page dos rotadores.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>GTM Container ID</Label>
            <Input value={ws.gtm_id || ''} onChange={(e) => update('gtm_id', e.target.value)} placeholder="GTM-XXXXXXX" />
            <p className="text-xs text-muted-foreground">Formato: GTM-XXXXXXX. Deixe vazio para não usar.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Google Ads</CardTitle>
          <CardDescription>Customer ID para offline conversions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Customer ID</Label>
            <Input value={ws.google_ads_id || ''} onChange={(e) => update('google_ads_id', e.target.value)} placeholder="123-456-7890" />
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
          <CardDescription>URL externa que receberá notificações de novos leads (opcional).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input value={ws.webhook_url || ''} onChange={(e) => update('webhook_url', e.target.value)} />
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar tudo'}</Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <Check className="w-4 h-4" /> Salvo!
              </span>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
