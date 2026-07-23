import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fetcher, putter } from '@/lib/fetcher';
import { PUBLIC_ORIGIN } from '@/lib/apiBase';

type Conn = {
  id: string;
  session_name: string;
  phone_number: string | null;
  status: string;
  workspace?: {
    id: string;
    meta_pixel_id?: string | null;
    meta_capi_token?: string | null;
    google_ads_id?: string | null;
  };
};

export function NumberDetails() {
  const { id } = useParams();
  const [conn, setConn] = useState<Conn | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ session_name: '', phone_number: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetcher(`/numbers/${id}`).then((c: Conn) => {
      setConn(c);
      setForm({ session_name: c.session_name, phone_number: c.phone_number || '' });
    }).finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    setSaving(true);
    await putter(`/numbers/${id}`, form);
    setSaving(false);
    alert('Salvo.');
  };

  if (loading) return <div><Skeleton className="h-8 w-64 mb-6" /><Skeleton className="h-[400px] w-full" /></div>;
  if (!conn) return <div>Não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/numbers"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{conn.session_name}</h1>
            {conn.status === 'CONNECTED'
              ? <Badge className="bg-emerald-500">Conectado</Badge>
              : <Badge variant="destructive">Desconectado</Badge>}
          </div>
          <p className="text-muted-foreground mt-1">{conn.phone_number || 'Sem telefone'}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>Edite session name e telefone desta conexão uazapi.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Session Name (instância uazapi)</Label>
            <Input value={form.session_name} readOnly disabled />
            <p className="text-xs text-muted-foreground">Fixo — usado pra casar o webhook. Para conectar/reconectar, use o botão na lista de números.</p>
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Webhook URL para uazapi</Label>
            <Input readOnly value={`${PUBLIC_ORIGIN}/api/webhooks/whatsapp`} />
            <p className="text-xs text-muted-foreground">Cole essa URL no painel da uazapi com evento <code>messages.upsert</code>.</p>
          </div>
        </CardContent>
        <div className="px-6 pb-6">
          <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </Card>

      {conn.workspace && (
        <Card>
          <CardHeader>
            <CardTitle>Credenciais do Workspace</CardTitle>
            <CardDescription>Configurar Meta CAPI e Google Ads em /settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Meta Pixel: <code>{conn.workspace.meta_pixel_id || '—'}</code></div>
            <div>Meta Token: <code>{conn.workspace.meta_capi_token ? '••••••' : '—'}</code></div>
            <div>Google Ads ID: <code>{conn.workspace.google_ads_id || '—'}</code></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
