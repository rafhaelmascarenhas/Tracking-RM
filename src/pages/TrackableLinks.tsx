import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Pencil, Copy } from 'lucide-react';
import { fetcher, poster, putter, deleter } from '@/lib/fetcher';

type Link = {
  id: string;
  short_code: string;
  destination_url: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};

const empty: Partial<Link> = { destination_url: '', utm_source: '', utm_medium: '', utm_campaign: '' };

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function TrackableLinks() {
  const [items, setItems] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Link>>(empty);

  const load = () => {
    setLoading(true);
    fetcher('/trackable-links').then(setItems).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (form.id) await putter(`/trackable-links/${form.id}`, form);
    else await poster('/trackable-links', form);
    setOpen(false); setForm(empty); load();
  };
  const del = async (id: string) => {
    if (!confirm('Excluir link?')) return;
    await deleter(`/trackable-links/${id}`); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">Links Rastreáveis</h2>
        <Button onClick={() => { setForm(empty); setOpen(true); }} className="bg-[#0095FF] text-white">
          <Plus className="w-4 h-4 mr-1" /> Novo Link
        </Button>
      </div>

      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Link Curto</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12">Carregando...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-gray-500">Nenhum link cadastrado.</TableCell></TableRow>
            ) : items.map((l) => {
              const fullUrl = `${API_URL}/r/${l.short_code}`;
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <code className="text-blue-600">{fullUrl}</code>
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(fullUrl)}><Copy className="w-3 h-3" /></Button>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{l.destination_url}</TableCell>
                  <TableCell>{l.utm_source || '-'}</TableCell>
                  <TableCell>{l.utm_campaign || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setForm(l); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => del(l.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? 'Editar' : 'Novo'} Link Rastreável</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>URL de destino</Label><Input value={form.destination_url || ''} onChange={(e) => setForm({ ...form, destination_url: e.target.value })} placeholder="https://wa.me/55..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>utm_source</Label><Input value={form.utm_source || ''} onChange={(e) => setForm({ ...form, utm_source: e.target.value })} /></div>
              <div><Label>utm_medium</Label><Input value={form.utm_medium || ''} onChange={(e) => setForm({ ...form, utm_medium: e.target.value })} /></div>
              <div className="col-span-2"><Label>utm_campaign</Label><Input value={form.utm_campaign || ''} onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
