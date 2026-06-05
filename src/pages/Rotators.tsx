import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Pencil, Copy, Shuffle, ChevronUp, ChevronDown, MousePointerClick, QrCode } from 'lucide-react';
import { fetcher, poster, putter, deleter } from '@/lib/fetcher';

type NumberConn = {
  id: string;
  session_name: string;
  phone_number?: string | null;
  status: string;
};

type RotatorTarget = { id: string; connection_id: string; weight: number; priority: number };

type Rotator = {
  id: string;
  short_code: string;
  name: string;
  distribution: string;
  prefilled_text: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  active: boolean;
  use_landing: boolean;
  landing_logo?: string | null;
  landing_title?: string | null;
  landing_cta?: string | null;
  hide_token: boolean;
  targets?: RotatorTarget[];
  _count?: { clicks: number; targets: number };
  _matched_clicks?: number;
};

type RotatorClick = {
  id: string;
  token: string | null;
  connection_id: string;
  fbclid: string | null;
  gclid: string | null;
  ip_address: string | null;
  status: string;
  matched_at: string | null;
  created_at: string;
};

type TargetEntry = { connection_id: string; weight: number };
type FormState = Partial<Rotator> & { form_targets: TargetEntry[] };

const empty: FormState = {
  name: '',
  distribution: 'ROUND_ROBIN',
  prefilled_text: 'Olá! Vim pelo anúncio e quero saber mais.',
  utm_source: 'meta',
  utm_medium: 'cpc',
  utm_campaign: '',
  use_landing: false,
  landing_logo: '',
  landing_title: '',
  landing_cta: '',
  hide_token: false,
  form_targets: [],
};

const DIST_LABELS: Record<string, string> = {
  ROUND_ROBIN: 'Round-robin',
  WEIGHTED: 'Ponderado',
  FALLBACK: 'Fallback',
};

const PUBLIC_ORIGIN =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001');

export function Rotators() {
  const [items, setItems] = useState<Rotator[]>([]);
  const [numbers, setNumbers] = useState<NumberConn[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);

  const [clicksOpen, setClicksOpen] = useState(false);
  const [clicksTitle, setClicksTitle] = useState('');
  const [clicksRotatorId, setClicksRotatorId] = useState('');
  const [clicks, setClicks] = useState<RotatorClick[]>([]);
  const [clicksLoading, setClicksLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetcher('/rotators'), fetcher('/numbers')])
      .then(([rot, nums]) => {
        setItems(rot);
        setNumbers(nums);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => { setForm(empty); setOpen(true); };

  const openEdit = async (r: Rotator) => {
    const full = await fetcher(`/rotators/${r.id}`);
    const form_targets: TargetEntry[] = [...(full.targets || [])]
      .sort((a: RotatorTarget, b: RotatorTarget) => a.priority - b.priority)
      .map((t: RotatorTarget) => ({ connection_id: t.connection_id, weight: t.weight }));
    setForm({ ...full, form_targets });
    setOpen(true);
  };

  const redistributeEqual = (targets: TargetEntry[]): TargetEntry[] => {
    if (targets.length === 0) return targets;
    const base = Math.floor(100 / targets.length);
    const remainder = 100 - base * targets.length;
    return targets.map((t, i) => ({ ...t, weight: i === 0 ? base + remainder : base }));
  };

  const toggleTarget = (id: string) => {
    const cur = form.form_targets;
    const exists = cur.some((t) => t.connection_id === id);
    let next = exists
      ? cur.filter((t) => t.connection_id !== id)
      : [...cur, { connection_id: id, weight: 1 }];
    if (form.distribution === 'WEIGHTED') next = redistributeEqual(next);
    setForm({ ...form, form_targets: next });
  };

  const moveTarget = (idx: number, dir: -1 | 1) => {
    const arr = [...form.form_targets];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    setForm({ ...form, form_targets: arr });
  };

  const setPct = (connection_id: string, val: number) => {
    setForm({
      ...form,
      form_targets: form.form_targets.map((t) =>
        t.connection_id === connection_id ? { ...t, weight: Math.min(100, Math.max(1, val)) } : t
      ),
    });
  };

  const weightTotal = form.form_targets.reduce((s, t) => s + t.weight, 0);

  const weightError = form.distribution === 'WEIGHTED' && form.form_targets.length > 0 && weightTotal !== 100;

  const save = async () => {
    if (weightError) return;
    const payload = {
      name: form.name,
      distribution: form.distribution,
      prefilled_text: form.prefilled_text,
      utm_source: form.utm_source,
      utm_medium: form.utm_medium,
      utm_campaign: form.utm_campaign,
      use_landing: form.use_landing ?? false,
      landing_logo: form.landing_logo || null,
      landing_title: form.landing_title || null,
      landing_cta: form.landing_cta || null,
      hide_token: form.hide_token ?? false,
      targets: form.form_targets.map(({ connection_id, weight }, i) => ({
        connection_id,
        weight,
        priority: i,
      })),
    };
    if (form.id) await putter(`/rotators/${form.id}`, payload);
    else await poster('/rotators', payload);
    setOpen(false);
    setForm(empty);
    load();
  };

  const del = async (id: string) => {
    if (!confirm('Excluir rotador?')) return;
    await deleter(`/rotators/${id}`);
    load();
  };

  const toggleActive = async (r: Rotator) => {
    await putter(`/rotators/${r.id}`, { active: !r.active });
    load();
  };

  const fetchClicks = async (id: string, from: string, to: string) => {
    setClicksLoading(true);
    try {
      const params = new URLSearchParams({ take: '200' });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const data = await fetcher(`/rotators/${id}/clicks?${params}`);
      setClicks(data);
    } finally {
      setClicksLoading(false);
    }
  };

  const openClicks = async (r: Rotator) => {
    setClicksTitle(r.name);
    setClicksRotatorId(r.id);
    setDateFrom('');
    setDateTo('');
    setClicksOpen(true);
    fetchClicks(r.id, '', '');
  };

  const numMap = Object.fromEntries(numbers.map((n) => [n.id, n]));

  // For FALLBACK mode: show selected numbers first (in priority order), then unselected
  const sortedNumbers =
    form.distribution === 'FALLBACK'
      ? [
          ...form.form_targets
            .map((t) => numbers.find((n) => n.id === t.connection_id))
            .filter(Boolean) as NumberConn[],
          ...numbers.filter((n) => !form.form_targets.some((t) => t.connection_id === n.id)),
        ]
      : numbers;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Rotadores de Números</h2>
          <p className="text-sm text-gray-500">Distribua os leads de 1 anúncio entre vários números de WhatsApp.</p>
        </div>
        <Button onClick={openNew} className="bg-[#0095FF] text-white">
          <Plus className="w-4 h-4 mr-1" /> Novo Rotador
        </Button>
      </div>

      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Link do anúncio</TableHead>
              <TableHead>Distribuição</TableHead>
              <TableHead className="text-center">Números</TableHead>
              <TableHead className="text-center">Cliques</TableHead>
              <TableHead className="text-center">Match</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12">Carregando...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-gray-500">Nenhum rotador cadastrado.</TableCell></TableRow>
            ) : items.map((r) => {
              const base = PUBLIC_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : '');
              const directUrl = `${base}/j/${r.short_code}`;
              const metaUrl = `${base}/j/chat/${r.short_code}`;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="space-y-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400 w-10 shrink-0">Direto</span>
                      <code className="text-blue-600 text-xs truncate max-w-[180px]">{directUrl}</code>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => navigator.clipboard.writeText(directUrl)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400 w-10 shrink-0">Meta</span>
                      <code className="text-green-600 text-xs truncate max-w-[180px]">{metaUrl}</code>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => navigator.clipboard.writeText(metaUrl)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{DIST_LABELS[r.distribution] || r.distribution}</Badge>
                  </TableCell>
                  <TableCell className="text-center">{r._count?.targets ?? 0}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-gray-600 hover:text-gray-900"
                      onClick={() => openClicks(r)}
                    >
                      <MousePointerClick className="w-3 h-3" />
                      {r._count?.clicks ?? 0}
                    </Button>
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const total = r._count?.clicks ?? 0;
                      const matched = r._matched_clicks ?? 0;
                      if (total === 0) return <span className="text-gray-400 text-sm">—</span>;
                      const pct = Math.round((matched / total) * 100);
                      return (
                        <span className={`text-sm font-medium ${pct >= 50 ? 'text-green-600' : pct >= 20 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {pct}%
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={r.active ? 'default' : 'secondary'}
                      className={`cursor-pointer select-none ${r.active ? 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200' : 'hover:bg-gray-200'}`}
                      onClick={() => toggleActive(r)}
                    >
                      {r.active ? 'Ativo' : 'Pausado'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" title="QR Code" onClick={() => setQrUrl(metaUrl)}><QrCode className="w-4 h-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)} className="gap-1"><Pencil className="w-3 h-3" /> Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => del(r.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shuffle className="w-4 h-4" /> {form.id ? 'Editar' : 'Novo'} Rotador
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Campanha Verão SP"
              />
            </div>

            <div>
              <Label>Modo de distribuição</Label>
              <div className="flex gap-2 mt-1">
                {Object.keys(DIST_LABELS).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={form.distribution === mode ? 'default' : 'outline'}
                    onClick={() => setForm({ ...form, distribution: mode })}
                  >
                    {DIST_LABELS[mode]}
                  </Button>
                ))}
              </div>
              {form.distribution === 'WEIGHTED' && (
                <p className="text-xs text-gray-500 mt-1">Defina a % de cada número. Total deve ser exatamente 100%.</p>
              )}
              {form.distribution === 'FALLBACK' && (
                <p className="text-xs text-gray-500 mt-1">Primeiro número recebe tudo. Próximo entra só se offline. Use ↑↓ para definir prioridade.</p>
              )}
            </div>

            <div>
              <Label>Números {form.distribution === 'FALLBACK' ? '(ordenados por prioridade)' : '(só conectados recebem)'}</Label>
              <div className="mt-1 border rounded-lg divide-y max-h-52 overflow-y-auto">
                {numbers.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">Nenhum número cadastrado.</div>
                ) : sortedNumbers.map((n) => {
                  const idx = form.form_targets.findIndex((t) => t.connection_id === n.id);
                  const checked = idx !== -1;
                  const entry = checked ? form.form_targets[idx] : null;
                  return (
                    <div key={n.id} className="flex items-center gap-3 p-2 hover:bg-gray-50">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleTarget(n.id)}
                      />
                      <span
                        className="flex-1 text-sm cursor-pointer select-none"
                        onClick={() => toggleTarget(n.id)}
                      >
                        {n.session_name}{n.phone_number ? ` (${n.phone_number})` : ''}
                      </span>
                      <Badge
                        variant={n.status === 'CONNECTED' ? 'default' : 'destructive'}
                        className="text-xs shrink-0"
                      >
                        {n.status === 'CONNECTED' ? 'Conectado' : 'Offline'}
                      </Badge>

                      {checked && form.distribution === 'WEIGHTED' && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={entry!.weight}
                            onChange={(e) => setPct(n.id, parseInt(e.target.value) || 1)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-16 h-7 text-sm"
                          />
                          <span className="text-xs text-gray-500">%</span>
                        </div>
                      )}

                      {checked && form.distribution === 'FALLBACK' && (
                        <div className="flex flex-col gap-0 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-5 w-6 p-0"
                            onClick={(e) => { e.stopPropagation(); moveTarget(idx, -1); }}
                            disabled={idx === 0}
                          >
                            <ChevronUp className="w-3 h-3" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-5 w-6 p-0"
                            onClick={(e) => { e.stopPropagation(); moveTarget(idx, 1); }}
                            disabled={idx === form.form_targets.length - 1}
                          >
                            <ChevronDown className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {form.distribution === 'WEIGHTED' && form.form_targets.length > 0 && (
              <div className={`text-xs font-medium flex items-center gap-1 -mt-1 ${weightTotal === 100 ? 'text-green-600' : 'text-red-500'}`}>
                Total: {weightTotal}%
                {weightTotal === 100 ? ' ✓' : weightTotal < 100 ? ` — faltam ${100 - weightTotal}%` : ` — excede em ${weightTotal - 100}%`}
              </div>
            )}

            <div>
              <Label>Mensagem pré-preenchida</Label>
              <Input
                value={form.prefilled_text || ''}
                onChange={(e) => setForm({ ...form, prefilled_text: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">Essa frase rastreia a campanha — mantenha única por rotador.</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>utm_source</Label>
                <Input value={form.utm_source || ''} onChange={(e) => setForm({ ...form, utm_source: e.target.value })} />
              </div>
              <div>
                <Label>utm_medium</Label>
                <Input value={form.utm_medium || ''} onChange={(e) => setForm({ ...form, utm_medium: e.target.value })} />
              </div>
              <div>
                <Label>utm_campaign</Label>
                <Input value={form.utm_campaign || ''} onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })} />
              </div>
            </div>

            {/* Rastreamento */}
            <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Rastreamento</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!!form.hide_token}
                  onCheckedChange={(v) => setForm({ ...form, hide_token: !!v })}
                />
                <span className="text-sm">Ocultar código da mensagem (usa fallback 6h)</span>
              </label>
            </div>

            {/* Landing page */}
            <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Landing page (Meta Ads)</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={!!form.use_landing}
                    onCheckedChange={(v) => setForm({ ...form, use_landing: !!v })}
                  />
                  <span className="text-xs text-gray-600">Ativar por padrão no link direto</span>
                </label>
              </div>
              <div>
                <Label className="text-xs">URL do Logo</Label>
                <Input
                  value={form.landing_logo || ''}
                  onChange={(e) => setForm({ ...form, landing_logo: e.target.value })}
                  placeholder="https://seusite.com/logo.png"
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Título</Label>
                  <Input
                    value={form.landing_title || ''}
                    onChange={(e) => setForm({ ...form, landing_title: e.target.value })}
                    placeholder="Fale com a gente"
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Texto do botão</Label>
                  <Input
                    value={form.landing_cta || ''}
                    onChange={(e) => setForm({ ...form, landing_cta: e.target.value })}
                    placeholder="💬 Abrir WhatsApp"
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!!weightError} title={weightError ? 'Total deve ser 100%' : ''}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code dialog */}
      {qrUrl && (
        <Dialog open={!!qrUrl} onOpenChange={() => setQrUrl(null)}>
          <DialogContent className="max-w-xs">
            <DialogHeader><DialogTitle>QR Code</DialogTitle></DialogHeader>
            <div className="flex flex-col items-center gap-3 py-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrUrl)}`}
                alt="QR Code"
                className="rounded-lg border"
                width={220}
                height={220}
              />
              <p className="text-xs text-gray-500 text-center break-all">{qrUrl}</p>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(qrUrl)}>
                <Copy className="w-3 h-3 mr-1" /> Copiar link
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Clicks drill-down */}
      <Sheet open={clicksOpen} onOpenChange={setClicksOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MousePointerClick className="w-4 h-4" /> Cliques — {clicksTitle}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex items-end gap-2">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm w-36" />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm w-36" />
            </div>
            <Button size="sm" onClick={() => fetchClicks(clicksRotatorId, dateFrom, dateTo)}>Filtrar</Button>
            <Button size="sm" variant="ghost" onClick={() => { setDateFrom(''); setDateTo(''); fetchClicks(clicksRotatorId, '', ''); }}>Limpar</Button>
          </div>
          {clicks.length > 0 && (
            <div className="mt-3 flex gap-4 text-sm">
              <span className="text-gray-600">Total: <strong>{clicks.length}</strong></span>
              <span className="text-green-600">Casados: <strong>{clicks.filter(c => c.status === 'matched').length}</strong></span>
              <span className="text-gray-500">Pendentes: <strong>{clicks.filter(c => c.status === 'pending').length}</strong></span>
              <span className="text-blue-600">Taxa: <strong>{Math.round(clicks.filter(c => c.status === 'matched').length / clicks.length * 100)}%</strong></span>
            </div>
          )}
          <div className="mt-4">
            {clicksLoading ? (
              <p className="text-sm text-gray-500 text-center py-8">Carregando...</p>
            ) : clicks.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Nenhum clique registrado ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>fbclid</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="text-center">Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clicks.map((c) => {
                    const num = numMap[c.connection_id];
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs text-gray-600 whitespace-nowrap">
                          {new Date(c.created_at).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-sm">
                          {num?.session_name || c.connection_id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-xs font-mono max-w-[110px] truncate" title={c.fbclid || ''}>
                          {c.fbclid ? `${c.fbclid.slice(0, 14)}…` : '—'}
                        </TableCell>
                        <TableCell className="text-xs">{c.ip_address || '—'}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={c.status === 'matched' ? 'default' : 'secondary'}
                            className={c.status === 'matched' ? 'bg-green-100 text-green-700 border-green-200' : ''}
                          >
                            {c.status === 'matched' ? 'Casado' : 'Pendente'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
