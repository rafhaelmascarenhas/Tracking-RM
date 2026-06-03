import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Settings, Trash2, QrCode, Loader2, CheckCircle2 } from 'lucide-react';
import { fetcher, poster, deleter } from '@/lib/fetcher';

type Conn = {
  id: string;
  session_name: string;
  phone_number: string | null;
  status: string;
  profile_name?: string | null;
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'CONNECTED') return <Badge className="bg-emerald-500">Conectado</Badge>;
  if (status === 'CONNECTING') return <Badge className="bg-amber-500">Conectando</Badge>;
  return <Badge variant="destructive">Desconectado</Badge>;
}

// Modal de leitura de QR: chama /connect, mostra o QR e faz polling de status até conectar.
function QrDialog({ conn, onClose, onConnected }: { conn: Conn; onClose: () => void; onConnected: () => void }) {
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [status, setStatus] = useState(conn.status);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };

  const start = async () => {
    setError(null);
    try {
      const s = await poster(`/numbers/${conn.id}/connect`);
      setQrcode(s.qrcode);
      setStatus(s.status);
      if (s.status === 'CONNECTED') { onConnected(); return; }
    } catch (e: any) {
      setError(e.message || 'Falha ao iniciar conexão');
      return;
    }
    stop();
    timer.current = setInterval(async () => {
      try {
        const s = await fetcher(`/numbers/${conn.id}/status`);
        if (s.qrcode) setQrcode(s.qrcode);
        setStatus(s.status);
        if (s.status === 'CONNECTED') { stop(); onConnected(); }
      } catch { /* mantém tentando */ }
    }, 2500);
  };

  useEffect(() => { start(); return stop; }, []); // eslint-disable-line

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { stop(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar {conn.session_name}</DialogTitle>
          <DialogDescription>Abra o WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho e escaneie o código.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-4 min-h-[280px]">
          {error ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-red-500">{error}</p>
              <Button onClick={start}>Tentar de novo</Button>
            </div>
          ) : status === 'CONNECTED' ? (
            <div className="text-center space-y-2">
              <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
              <p className="font-medium">Conectado!</p>
            </div>
          ) : qrcode ? (
            <>
              <img src={qrcode} alt="QR Code" className="h-60 w-60 rounded-lg border" />
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Aguardando leitura...
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={start}>Gerar novo QR</Button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" /> Gerando QR code...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Numbers() {
  const [items, setItems] = useState<Conn[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [qrConn, setQrConn] = useState<Conn | null>(null);

  const load = () => {
    setLoading(true);
    fetcher('/numbers').then(setItems).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const create = async () => {
    if (!name.trim()) { alert('Dê um nome ao número'); return; }
    setCreating(true);
    try {
      const conn: Conn = await poster('/numbers', { session_name: name.trim() });
      setOpen(false); setName('');
      load();
      setQrConn(conn); // já abre o QR pra escanear
    } catch (e: any) {
      alert(e.message || 'Erro ao criar');
    } finally {
      setCreating(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm('Excluir conexão? A instância na uazapi também será removida.')) return;
    await deleter(`/numbers/${id}`); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Números WhatsApp</h1>
          <p className="text-muted-foreground mt-1">Conecte números lendo o QR code. Usados em rotadores e rastreamento.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Adicionar número</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo número</DialogTitle>
              <DialogDescription>Dê um nome (ex: Vendas SP). Criamos a instância e abrimos o QR na hora.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label>Nome do número</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: vendas-sp" onKeyDown={(e) => e.key === 'Enter' && create()} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={create} disabled={creating}>{creating ? 'Criando...' : 'Criar e conectar'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Números Conectados</CardTitle>
          <CardDescription>Instâncias uazapi deste workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Nenhum número. Clique em "Adicionar número".</TableCell></TableRow>
              ) : items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.session_name}{c.profile_name ? <span className="text-muted-foreground font-normal"> · {c.profile_name}</span> : null}</TableCell>
                  <TableCell>{c.phone_number || '-'}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant={c.status === 'CONNECTED' ? 'outline' : 'default'} size="sm" onClick={() => setQrConn(c)}>
                      <QrCode className="h-4 w-4 mr-1" /> {c.status === 'CONNECTED' ? 'Reconectar' : 'Conectar'}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/numbers/${c.id}`}><Settings className="h-4 w-4" /></Link>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => del(c.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {qrConn && (
        <QrDialog
          conn={qrConn}
          onClose={() => setQrConn(null)}
          onConnected={() => { setTimeout(() => { setQrConn(null); load(); }, 1200); }}
        />
      )}
    </div>
  );
}
