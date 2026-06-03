import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { fetcher, poster, putter, deleter } from '@/lib/fetcher';

type Msg = {
  id: string;
  base_text: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
};

const empty: Partial<Msg> = { base_text: '', utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '', utm_content: '' };

export function TrackableMessages() {
  const [items, setItems] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Msg>>(empty);

  const load = () => {
    setLoading(true);
    fetcher('/trackable-messages').then(setItems).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    if (form.id) await putter(`/trackable-messages/${form.id}`, form);
    else await poster('/trackable-messages', form);
    setOpen(false);
    setForm(empty);
    load();
  };

  const del = async (id: string) => {
    if (!confirm('Excluir mensagem?')) return;
    await deleter(`/trackable-messages/${id}`);
    load();
  };

  const edit = (m: Msg) => { setForm(m); setOpen(true); };
  const create = () => { setForm(empty); setOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">Mensagens Rastreáveis</h2>
        <Button onClick={create} className="bg-[#0095FF] hover:bg-[#0080FF] text-white">
          <Plus className="w-4 h-4 mr-1" /> Nova Mensagem
        </Button>
      </div>

      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Texto Base</TableHead>
              <TableHead>UTM Source</TableHead>
              <TableHead>UTM Campaign</TableHead>
              <TableHead>UTM Medium</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12">Carregando...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-gray-500">Nenhuma mensagem cadastrada.</TableCell></TableRow>
            ) : items.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="max-w-md truncate">{m.base_text}</TableCell>
                <TableCell>{m.utm_source || '-'}</TableCell>
                <TableCell>{m.utm_campaign || '-'}</TableCell>
                <TableCell>{m.utm_medium || '-'}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => edit(m)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(m.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? 'Editar' : 'Nova'} Mensagem Rastreável</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Texto Base</Label>
              <Input value={form.base_text || ''} onChange={(e) => setForm({ ...form, base_text: e.target.value })} placeholder="Olá, vim do anúncio..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>utm_source</Label><Input value={form.utm_source || ''} onChange={(e) => setForm({ ...form, utm_source: e.target.value })} /></div>
              <div><Label>utm_medium</Label><Input value={form.utm_medium || ''} onChange={(e) => setForm({ ...form, utm_medium: e.target.value })} /></div>
              <div><Label>utm_campaign</Label><Input value={form.utm_campaign || ''} onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })} /></div>
              <div><Label>utm_term</Label><Input value={form.utm_term || ''} onChange={(e) => setForm({ ...form, utm_term: e.target.value })} /></div>
              <div className="col-span-2"><Label>utm_content</Label><Input value={form.utm_content || ''} onChange={(e) => setForm({ ...form, utm_content: e.target.value })} /></div>
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
