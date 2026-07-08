import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { fetcher, poster, patcher, deleter } from '@/lib/fetcher';
import { META_EVENTS } from '@/lib/metaEvents';

type Stage = { id: string; name: string; origin?: string | null };
type Ev = {
  id: string;
  platform: string;
  event_name: string;
  value?: number | null;
  currency?: string | null;
  journey_stage_id: string;
  journeyStage?: { name: string; origin?: string | null } | null;
};

// Nomes de evento disponíveis (Meta) — inclui LeadSubmitted (CTWA).
const EVENT_NAMES = ['LeadSubmitted', ...META_EVENTS.map((e) => e.name)];

const emptyForm = { id: '', journey_stage_id: '', platform: 'META', event_name: 'Purchase', value: '', currency: 'BRL' };

export function ConversionEvents() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    setLoading(true);
    Promise.all([fetcher('/conversion-events'), fetcher('/journey-stages')])
      .then(([evs, sts]) => { setEvents(evs); setStages(sts); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const stageLabel = (s?: { name: string; origin?: string | null } | null) =>
    s ? `${s.name}${s.origin ? ` (${s.origin})` : ''}` : '-';

  const openNew = () => { setForm({ ...emptyForm, journey_stage_id: stages[0]?.id ?? '' }); setOpen(true); };
  const openEdit = (e: Ev) => {
    setForm({
      id: e.id,
      journey_stage_id: e.journey_stage_id,
      platform: e.platform,
      event_name: e.event_name,
      value: e.value != null ? String(e.value) : '',
      currency: e.currency || 'BRL',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.journey_stage_id) return;
    setSaving(true);
    try {
      const body = {
        journey_stage_id: form.journey_stage_id,
        platform: form.platform,
        event_name: form.event_name,
        value: form.value,
        currency: form.currency,
      };
      if (form.id) await patcher(`/conversion-events/${form.id}`, body);
      else await poster('/conversion-events', body);
      setOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: Ev) => {
    if (!confirm(`Excluir o evento ${e.event_name} da etapa "${e.journeyStage?.name ?? ''}"?`)) return;
    await deleter(`/conversion-events/${e.id}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Eventos de Conversão</h2>
          <p className="text-sm text-gray-500">
            Eventos que disparam em cada etapa da jornada. Crie, edite e veja onde cada um é usado.
          </p>
        </div>
        <Button onClick={openNew} disabled={stages.length === 0} className="shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Adicionar evento
        </Button>
      </div>

      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Plataforma</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Etapa (onde é usado)</TableHead>
              <TableHead>Funil</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12">Carregando...</TableCell></TableRow>
            ) : events.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-gray-500">Nenhum evento configurado. Clique em "Adicionar evento".</TableCell></TableRow>
            ) : events.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-[#0095FF] font-semibold">{e.platform === 'META' ? 'Meta' : e.platform}</TableCell>
                <TableCell className="font-medium">{e.event_name}</TableCell>
                <TableCell>{e.journeyStage?.name ?? '-'}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">
                    {e.journeyStage?.origin ?? '-'}
                  </span>
                </TableCell>
                <TableCell className="text-gray-600">{e.value != null ? `${e.currency || 'BRL'} ${e.value}` : '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(e)} title="Editar"><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(e)} title="Excluir" className="text-red-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar evento' : 'Novo evento de conversão'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Etapa da jornada</label>
              <select value={form.journey_stage_id} onChange={(e) => setForm({ ...form, journey_stage_id: e.target.value })} className="mt-1 w-full h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white outline-none focus:border-blue-500">
                {stages.map((s) => <option key={s.id} value={s.id}>{stageLabel(s)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Plataforma</label>
                <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="mt-1 w-full h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white outline-none focus:border-blue-500">
                  <option value="META">Meta</option>
                  <option value="GOOGLE">Google</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Evento</label>
                <select value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} className="mt-1 w-full h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white outline-none focus:border-blue-500">
                  {EVENT_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Valor padrão (opcional)</label>
                <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="ex: 228" className="mt-1 h-9" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Moeda</label>
                <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="mt-1 h-9" />
              </div>
            </div>
            <p className="text-xs text-gray-400">Valor da venda substitui esse padrão quando a frase do atendente traz o valor.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.journey_stage_id}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
