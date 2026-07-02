import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { fetcher, poster, putter, deleter } from '@/lib/fetcher';
import { META_EVENTS, eventLabel } from '@/lib/metaEvents';

type Stage = {
  id: string;
  name: string;
  order_index: number;
  system_default: boolean;
  keyword?: string | null;
  is_sale?: boolean;
  is_first_contact?: boolean;
  event_name?: string; // evento associado (derivado de conversionEvents[0])
  created_at: string;
  conversionEvents?: { id: string; platform: string; event_name: string }[];
};

const empty: Partial<Stage> = { name: '', order_index: 0, keyword: '', is_sale: false, is_first_contact: false, event_name: '' };

export function PurchaseJourney() {
  const [items, setItems] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Stage>>(empty);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [orderList, setOrderList] = useState<Stage[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    fetcher('/journey-stages').then(setItems).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openReorder = () => { setOrderList([...items]); setReorderOpen(true); };
  const onDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...orderList];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setOrderList(next);
    setDragIdx(null);
  };
  const saveOrder = async () => {
    await putter('/journey-stages/reorder', { order: orderList.map((s, i) => ({ id: s.id, order_index: i })) });
    setReorderOpen(false); load();
  };

  const save = async () => {
    if (form.id) await putter(`/journey-stages/${form.id}`, form);
    else await poster('/journey-stages', { ...form, order_index: items.length });
    setOpen(false); setForm(empty); load();
  };
  const del = async (id: string) => {
    if (!confirm('Excluir etapa?')) return;
    await deleter(`/journey-stages/${id}`); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">Jornada de Compra</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openReorder}>Ordenar Etapas</Button>
          <Button onClick={() => { setForm(empty); setOpen(true); }} className="bg-[#0095FF] text-white">
            <Plus className="w-4 h-4 mr-1" /> Nova Etapa
          </Button>
        </div>
      </div>

      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Ordem</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Eventos</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12">Carregando...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-gray-500">Nenhuma etapa.</TableCell></TableRow>
            ) : items.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.order_index}</TableCell>
                <TableCell className="font-medium">
                  {s.name}
                  {s.is_first_contact && <span className="ml-2 text-xs" title="Primeiro contato">💬</span>}
                  {s.is_sale && <span className="ml-1 text-xs" title="Venda">✅</span>}
                  {s.system_default && <span className="ml-2 text-xs text-gray-400">(padrão)</span>}
                  {s.keyword && <div className="text-xs text-gray-400 font-normal mt-0.5">termo: "{s.keyword}"</div>}
                </TableCell>
                <TableCell>
                  {s.conversionEvents && s.conversionEvents.length > 0
                    ? s.conversionEvents.map((e) => `${e.platform}:${e.event_name}`).join(', ')
                    : '-'}
                </TableCell>
                <TableCell>{new Date(s.created_at).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setForm({ ...s, event_name: s.conversionEvents?.find((e) => e.platform === 'META')?.event_name || '' }); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(s.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={reorderOpen} onOpenChange={setReorderOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ordenar Etapas do Funil</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">Arraste para ordenar as etapas do funil.</p>
          <div className="space-y-2 py-2">
            {orderList.map((s, idx) => (
              <div
                key={s.id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                className="cursor-move rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-center font-medium hover:bg-gray-100"
              >
                ⋮⋮ {s.name}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReorderOpen(false)}>Cancelar</Button>
            <Button onClick={saveOrder}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? 'Editar' : 'Nova'} Etapa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Comprou" /></div>
            <div><Label>Ordem</Label><Input type="number" value={form.order_index ?? 0} onChange={(e) => setForm({ ...form, order_index: parseInt(e.target.value) || 0 })} /></div>
            <div>
              <Label>Evento de Conversão Associado</Label>
              <select
                className="w-full border rounded-md h-9 px-2 text-sm bg-white"
                value={form.event_name || ''}
                onChange={(e) => setForm({ ...form, event_name: e.target.value })}
              >
                <option value="">Nenhum (não dispara evento)</option>
                {META_EVENTS.map((ev) => (
                  <option key={ev.name} value={ev.name}>{eventLabel(ev.name)}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Evento enviado ao Meta quando o lead entra nesta etapa. Vazio = não dispara.</p>
            </div>
            <div>
              <Label>Termo-chave (atendente)</Label>
              <Input value={form.keyword || ''} onChange={(e) => setForm({ ...form, keyword: e.target.value })} placeholder="Ex: Parabéns pela sua compra" />
              <p className="text-xs text-gray-400 mt-1">Quando o atendente enviar essa frase, o lead move pra esta etapa e dispara o evento dela. Vazio = sem automação.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.is_sale} onChange={(e) => setForm({ ...form, is_sale: e.target.checked })} />
              Etapa representa uma <strong>venda</strong>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.is_first_contact} onChange={(e) => setForm({ ...form, is_first_contact: e.target.checked })} />
              Etapa representa o <strong>primeiro contato</strong>
            </label>
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
