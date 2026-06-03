import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { fetcher, poster, deleter } from '@/lib/fetcher';

type Event = {
  id: string;
  platform: string;
  event_name: string;
  journey_stage_id: string;
  value?: number | null;
  currency?: string;
  journeyStage?: { name: string };
  created_at: string;
};

type Stage = { id: string; name: string };

const META_EVENTS = [
  'ViewContent', 'Lead', 'Purchase', 'AddPaymentInfo', 'AddToCart', 'AddToWishlist',
  'CompleteRegistration', 'Contact', 'CustomizeProduct', 'Donate', 'FindLocation',
  'InitiateCheckout', 'Schedule', 'Search', 'StartTrial', 'SubmitApplication', 'Subscribe',
];

export function ConversionEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ journey_stage_id: '', platform: 'META', event_name: 'Purchase', value: '', currency: 'BRL' });

  const load = () => {
    setLoading(true);
    Promise.all([fetcher('/conversion-events'), fetcher('/journey-stages')])
      .then(([e, s]) => { setEvents(e); setStages(s); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!form.journey_stage_id) { alert('Selecione uma etapa.'); return; }
    await poster('/conversion-events', form);
    setOpen(false); load();
  };
  const del = async (id: string) => {
    if (!confirm('Excluir evento?')) return;
    await deleter(`/conversion-events/${id}`); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">Eventos de Conversão</h2>
        <Button onClick={() => setOpen(true)} className="bg-[#0095FF] text-white">
          <Plus className="w-4 h-4 mr-1" /> Novo Evento
        </Button>
      </div>

      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Plataforma</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Valor padrão</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12">Carregando...</TableCell></TableRow>
            ) : events.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-gray-500">Nenhum evento.</TableCell></TableRow>
            ) : events.map((e) => (
              <TableRow key={e.id}>
                <TableCell><span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">{e.platform}</span></TableCell>
                <TableCell className="font-medium">{e.event_name}</TableCell>
                <TableCell>{e.value != null ? `${e.currency || 'BRL'} ${e.value.toFixed(2)}` : '—'}</TableCell>
                <TableCell>{e.journeyStage?.name || '-'}</TableCell>
                <TableCell>{new Date(e.created_at).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => del(e.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Evento de Conversão</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Etapa</Label>
              <select className="w-full border rounded px-3 py-2" value={form.journey_stage_id} onChange={(e) => setForm({ ...form, journey_stage_id: e.target.value })}>
                <option value="">Selecione...</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Plataforma</Label>
              <select className="w-full border rounded px-3 py-2" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                <option value="META">Meta</option>
                <option value="GOOGLE">Google</option>
              </select>
            </div>
            <div>
              <Label>Evento</Label>
              <select className="w-full border rounded px-3 py-2" value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })}>
                {META_EVENTS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Valor padrão (opcional)</Label>
                <input type="number" step="0.01" min="0" className="w-full border rounded px-3 py-2" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="ex: 197.00" />
              </div>
              <div>
                <Label>Moeda</Label>
                <select className="w-full border rounded px-3 py-2" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500">Valor padrão enviado ao Meta. Pode sobrescrever por lead ao marcar a conversão.</p>
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
