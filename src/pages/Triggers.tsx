import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Pencil, Zap, MessageSquare, DoorOpen } from 'lucide-react';
import { fetcher, poster, putter, deleter } from '@/lib/fetcher';

type Trigger = {
  id: string;
  name: string;
  platform: string;
  event_name: string;
  value: number | null;
  currency: string;
  trigger_type: string; // conversation_open | phrase
  phrase: string | null;
  direction: string; // lead | attendant | any
  only_rotator: boolean;
  rotator_id: string | null;
  active: boolean;
  _count?: { fired: number };
};

type RotatorOpt = { id: string; name: string };
type FormState = Partial<Trigger> & { scope?: string };

const empty: FormState = {
  name: '',
  platform: 'META',
  event_name: 'Lead',
  value: null,
  currency: 'BRL',
  trigger_type: 'conversation_open',
  phrase: '',
  direction: 'lead',
  only_rotator: false,
  rotator_id: null,
  scope: 'all',
  active: true,
};

const META_EVENTS = ['Lead', 'Purchase', 'InitiateCheckout', 'AddToCart', 'Contact', 'Schedule', 'CompleteRegistration', 'ViewContent'];
const DIR_LABELS: Record<string, string> = { lead: 'Lead manda', attendant: 'Atendente manda', any: 'Qualquer um' };

export function Triggers() {
  const [items, setItems] = useState<Trigger[]>([]);
  const [rotators, setRotators] = useState<RotatorOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);

  const load = () => {
    setLoading(true);
    Promise.all([fetcher('/triggers'), fetcher('/rotators')])
      .then(([trg, rot]) => { setItems(trg); setRotators(rot); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const scopeOf = (t: Trigger): string => (t.rotator_id ? t.rotator_id : t.only_rotator ? 'any_rotator' : 'all');
  const rotatorName = (id: string | null) => rotators.find((r) => r.id === id)?.name || 'rotador';

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (t: Trigger) => { setForm({ ...t, scope: scopeOf(t) }); setOpen(true); };

  const save = async () => {
    if (!form.name?.trim()) { alert('Dê um nome ao gatilho'); return; }
    if (form.trigger_type === 'phrase' && !form.phrase?.trim()) { alert('Defina a frase'); return; }
    // Traduz scope -> only_rotator / rotator_id
    const scope = form.scope || 'all';
    const payload = {
      ...form,
      only_rotator: scope === 'any_rotator',
      rotator_id: scope === 'all' || scope === 'any_rotator' ? null : scope,
    };
    if (form.id) await putter(`/triggers/${form.id}`, payload);
    else await poster('/triggers', payload);
    setOpen(false); setForm(empty); load();
  };

  const del = async (id: string) => {
    if (!confirm('Excluir gatilho?')) return;
    await deleter(`/triggers/${id}`); load();
  };

  const toggleActive = async (t: Trigger) => {
    await putter(`/triggers/${t.id}`, { active: !t.active }); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Gatilhos de Conversão</h2>
          <p className="text-sm text-gray-500">Dispare eventos pro Meta por mensagem. Leads do rotador atribuem ao anúncio automaticamente.</p>
        </div>
        <Button onClick={openNew} className="bg-[#0095FF] text-white">
          <Plus className="w-4 h-4 mr-1" /> Novo Gatilho
        </Button>
      </div>

      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Dispara quando</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="text-center">Disparos</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-gray-400">Carregando...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-gray-400">Nenhum gatilho. Crie um pra disparar conversões.</TableCell></TableRow>
            ) : items.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  {t.name}
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {t.rotator_id ? `Rotador: ${rotatorName(t.rotator_id)}` : t.only_rotator ? 'Qualquer rotador' : 'Todos os leads'}
                  </div>
                </TableCell>
                <TableCell><Badge variant="secondary">{t.event_name}</Badge></TableCell>
                <TableCell className="text-sm">
                  {t.trigger_type === 'conversation_open' ? (
                    <span className="flex items-center gap-1 text-gray-600"><DoorOpen className="w-3 h-3" /> Abrir conversa</span>
                  ) : (
                    <span className="flex items-center gap-1 text-gray-600">
                      <MessageSquare className="w-3 h-3" /> "{t.phrase}" <span className="text-xs text-gray-400">({DIR_LABELS[t.direction]})</span>
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{t.value != null ? `${t.currency} ${t.value}` : '—'}</TableCell>
                <TableCell className="text-center">{t._count?.fired ?? 0}</TableCell>
                <TableCell className="text-center">
                  <Badge
                    className={`cursor-pointer select-none ${t.active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500'}`}
                    onClick={() => toggleActive(t)}
                  >
                    {t.active ? 'Ativo' : 'Pausado'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)} className="gap-1"><Pencil className="w-3 h-3" /> Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => del(t.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="w-4 h-4" /> {form.id ? 'Editar' : 'Novo'} Gatilho</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Lead — abriu conversa" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Evento Meta</Label>
                <select
                  value={form.event_name}
                  onChange={(e) => setForm({ ...form, event_name: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {META_EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </div>
              <div>
                <Label>Valor (opcional)</Label>
                <Input type="number" value={form.value ?? ''} onChange={(e) => setForm({ ...form, value: e.target.value === '' ? null : Number(e.target.value) })} placeholder="197" />
              </div>
            </div>

            <div>
              <Label>Dispara quando</Label>
              <div className="flex gap-2 mt-1">
                <Button type="button" size="sm" variant={form.trigger_type === 'conversation_open' ? 'default' : 'outline'} onClick={() => setForm({ ...form, trigger_type: 'conversation_open', direction: 'lead' })}>
                  <DoorOpen className="w-3 h-3 mr-1" /> Abrir conversa
                </Button>
                <Button type="button" size="sm" variant={form.trigger_type === 'phrase' ? 'default' : 'outline'} onClick={() => setForm({ ...form, trigger_type: 'phrase' })}>
                  <MessageSquare className="w-3 h-3 mr-1" /> Frase
                </Button>
              </div>
            </div>

            {form.trigger_type === 'phrase' && (
              <>
                <div>
                  <Label>Frase (contém)</Label>
                  <Input value={form.phrase || ''} onChange={(e) => setForm({ ...form, phrase: e.target.value })} placeholder="parabéns pela sua compra" />
                  <p className="text-xs text-gray-500 mt-1">Dispara quando a mensagem contém esse texto.</p>
                </div>
                <div>
                  <Label>Quem manda a frase</Label>
                  <div className="flex gap-2 mt-1">
                    {(['lead', 'attendant', 'any'] as const).map((d) => (
                      <Button key={d} type="button" size="sm" variant={form.direction === d ? 'default' : 'outline'} onClick={() => setForm({ ...form, direction: d })}>
                        {DIR_LABELS[d]}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <Label>Aplicar a</Label>
              <select
                value={form.scope || 'all'}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1"
              >
                <option value="all">Todos os leads (orgânico + rotador)</option>
                <option value="any_rotator">Qualquer rotador (só atribuídos)</option>
                {rotators.map((r) => <option key={r.id} value={r.id}>Rotador: {r.name}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Escolha se o evento vale pra todos, qualquer lead de rotador, ou um rotador específico.</p>
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
