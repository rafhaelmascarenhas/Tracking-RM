import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Pencil, Copy, Users, ChevronUp, ChevronDown, MousePointerClick, QrCode, Upload, X, RotateCcw } from 'lucide-react';
import { fetcher, poster, putter, deleter } from '@/lib/fetcher';
import { PUBLIC_ORIGIN as PUBLIC_API_ORIGIN } from '@/lib/apiBase';

type GroupTarget = {
  id: string;
  name: string;
  invite_url: string;
  weight: number;
  priority: number;
  active: boolean;
  max_clicks: number | null;
  clicks_count: number;
  group_jid?: string | null;
};

type GroupRotator = {
  id: string;
  short_code: string;
  name: string;
  distribution: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  active: boolean;
  use_landing: boolean;
  landing_logo?: string | null;
  landing_title?: string | null;
  landing_cta?: string | null;
  redirect_seconds?: number;
  meta_pixel_id?: string | null;
  meta_capi_token?: string | null;
  gtm_id?: string | null;
  // Número que lê os grupos (resolve convite + recebe evento de entrada).
  // Não participa do redirecionamento — o clique vai direto pro grupo.
  connection_id?: string | null;
  targets?: GroupTarget[];
  _count?: { clicks: number; targets: number };
};

// Contagem de entradas por grupo. Só existe se o número for admin do grupo e o
// group_jid do target já tiver sido resolvido — daí o tracking_ready.
type GroupMemberStats = {
  targets: {
    id: string;
    name: string;
    invite_url: string;
    group_jid: string | null;
    clicks_count: number;
    tracking_ready: boolean;
    joined_total: number;
    members: number;
  }[];
  totals: {
    joined_total: number;
    members: number;
    clicks: number;
    unattributed_joins: number;
  };
};

type Connection = {
  id: string;
  provider: string;
  status: string;
  session_name: string;
  profile_name: string | null;
  phone_number: string | null;
};

type GroupClick = {
  id: string;
  fbclid: string | null;
  gclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  target?: { name: string; invite_url: string } | null;
};

function trafficSource(c: GroupClick): { label: string; cls: string } {
  if (c.fbclid) return { label: 'Meta', cls: 'bg-blue-100 text-blue-700 border-blue-200' };
  if (c.gclid) return { label: 'Google', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
  return { label: 'Direto', cls: 'bg-gray-100 text-gray-600 border-gray-200' };
}

function deviceFromUA(ua: string | null): string {
  if (!ua) return '—';
  if (/iphone|ipad|ios/i.test(ua)) return 'iOS';
  if (/android/i.test(ua)) return 'Android';
  if (/windows|macintosh|linux/i.test(ua)) return 'Desktop';
  return 'Outro';
}

function ExpandableValue({ value, max = 24, mono = true, copyable = false }: { value: string | null; max?: number; mono?: boolean; copyable?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!value) return <span className="text-gray-300">—</span>;
  const long = value.length > max;
  const shown = open || !long ? value : value.slice(0, max) + '…';
  return (
    <div className="flex items-start gap-1">
      <span className={`${mono ? 'font-mono text-[11px]' : 'text-xs'} text-gray-600 leading-tight ${open ? 'break-all' : 'whitespace-nowrap'}`}>
        {shown}
      </span>
      {copyable && (
        <button onClick={() => navigator.clipboard.writeText(value)} title="Copiar" className="shrink-0 text-gray-400 hover:text-blue-600">
          <Copy className="w-3 h-3" />
        </button>
      )}
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="shrink-0 text-[10px] font-medium text-blue-600 hover:underline whitespace-nowrap">
          {open ? 'ver menos' : 'ver mais'}
        </button>
      )}
    </div>
  );
}

// Entrada do formulário. `id` só existe em grupo já salvo (usado pra resetar contador).
type TargetEntry = {
  id?: string;
  name: string;
  invite_url: string;
  weight: number;
  max_clicks: number | null;
  clicks_count?: number;
  // Preenchido quando o grupo veio da lista do número — dispensa o
  // "Vincular grupos" depois de salvar.
  group_jid?: string | null;
};

// Grupo em que o número está, vindo do Evolution.
type AvailableGroup = {
  jid: string;
  name: string;
  size: number;
  is_admin: boolean;
};

type FormState = Partial<GroupRotator> & { form_targets: TargetEntry[] };

const emptyTarget = (): TargetEntry => ({ name: '', invite_url: '', weight: 1, max_clicks: 1000 });

const empty: FormState = {
  name: '',
  distribution: 'ROUND_ROBIN',
  utm_source: 'meta',
  utm_medium: 'cpc',
  utm_campaign: '',
  use_landing: false,
  landing_logo: '',
  landing_title: '',
  landing_cta: '',
  redirect_seconds: 3,
  meta_pixel_id: '',
  meta_capi_token: '',
  gtm_id: '',
  connection_id: null,
  form_targets: [emptyTarget()],
};

const DIST_LABELS: Record<string, string> = {
  ROUND_ROBIN: 'Round-robin',
  WEIGHTED: 'Ponderado',
  FALLBACK: 'Fila (enche um, vai pro próximo)',
};

const PUBLIC_ORIGIN = PUBLIC_API_ORIGIN;

// Valida no cliente o mesmo formato que o backend aceita.
const INVITE_RE = /(?:chat\.whatsapp\.com\/(?:invite\/)?)?([A-Za-z0-9]{15,30})(?:[/?#]|$)/;

export function GroupRotators() {
  const [items, setItems] = useState<GroupRotator[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);

  const [clicksOpen, setClicksOpen] = useState(false);
  const [clicksTitle, setClicksTitle] = useState('');
  const [clicksRotatorId, setClicksRotatorId] = useState('');
  const [clicks, setClicks] = useState<GroupClick[]>([]);
  const [clicksLoading, setClicksLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [membersOpen, setMembersOpen] = useState(false);
  const [membersTitle, setMembersTitle] = useState('');
  const [membersRotatorId, setMembersRotatorId] = useState('');
  const [membersConnectionId, setMembersConnectionId] = useState<string | null>(null);
  const [memberStats, setMemberStats] = useState<GroupMemberStats | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveMsg, setResolveMsg] = useState<string | null>(null);

  // Só Evolution: a contagem depende de /group/inviteInfo, que a uazapi não tem.
  const [evolutionConns, setEvolutionConns] = useState<Connection[]>([]);

  // Seleção de grupos a partir do número, em vez de colar link do celular.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [available, setAvailable] = useState<AvailableGroup[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [adminCount, setAdminCount] = useState(0);

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) { alert('Imagem muito grande. Máximo 300KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, landing_logo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const load = () => {
    setLoading(true);
    fetcher('/group-rotators')
      .then(setItems)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => {
    fetcher('/numbers')
      .then((all: Connection[]) => setEvolutionConns(all.filter((c) => c.provider === 'EVOLUTION')))
      .catch(() => setEvolutionConns([]));
  }, []);

  const openNew = () => { setForm({ ...empty, form_targets: [emptyTarget()] }); setOpen(true); };

  const openEdit = async (r: GroupRotator) => {
    const full = await fetcher(`/group-rotators/${r.id}`);
    const form_targets: TargetEntry[] = [...(full.targets || [])]
      .sort((a: GroupTarget, b: GroupTarget) => a.priority - b.priority)
      .map((t: GroupTarget) => ({
        id: t.id,
        name: t.name,
        invite_url: t.invite_url,
        weight: t.weight,
        max_clicks: t.max_clicks,
        clicks_count: t.clicks_count,
        group_jid: t.group_jid,
      }));
    setForm({ ...full, form_targets: form_targets.length ? form_targets : [emptyTarget()] });
    setOpen(true);
  };

  const redistributeEqual = (targets: TargetEntry[]): TargetEntry[] => {
    if (targets.length === 0) return targets;
    const base = Math.floor(100 / targets.length);
    const remainder = 100 - base * targets.length;
    return targets.map((t, i) => ({ ...t, weight: i === 0 ? base + remainder : base }));
  };

  const setTarget = (idx: number, patch: Partial<TargetEntry>) => {
    setForm((f) => ({
      ...f,
      form_targets: f.form_targets.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  };

  const addTarget = () => {
    setForm((f) => {
      const next = [...f.form_targets, emptyTarget()];
      return { ...f, form_targets: f.distribution === 'WEIGHTED' ? redistributeEqual(next) : next };
    });
  };

  const removeTarget = (idx: number) => {
    setForm((f) => {
      const next = f.form_targets.filter((_, i) => i !== idx);
      const safe = next.length ? next : [emptyTarget()];
      return { ...f, form_targets: f.distribution === 'WEIGHTED' ? redistributeEqual(safe) : safe };
    });
  };

  const moveTarget = (idx: number, dir: -1 | 1) => {
    const arr = [...form.form_targets];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    setForm({ ...form, form_targets: arr });
  };

  const openPicker = async () => {
    if (!form.connection_id) return;
    setPickerOpen(true);
    setPicking(true);
    setPickerError(null);
    setAvailable([]);
    setChosen(new Set());
    try {
      const r = await fetcher(`/group-rotators/available-groups?connection_id=${form.connection_id}`);
      setAvailable(r.groups);
      setAdminCount(r.admin_count ?? 0);
    } catch (e: any) {
      setPickerError(e.message || 'Não consegui listar os grupos.');
    } finally {
      setPicking(false);
    }
  };

  /**
   * Traz os grupos marcados pro formulário. O link de convite é buscado por
   * grupo (uma chamada cada) porque o Evolution não devolve isso na listagem.
   * Grupo cujo link o WhatsApp recusar é reportado em vez de entrar mudo com
   * o campo vazio.
   */
  const importChosen = async () => {
    if (!form.connection_id || chosen.size === 0) return;
    setImporting(true);
    setPickerError(null);
    const novos: TargetEntry[] = [];
    const falhas: string[] = [];

    for (const jid of chosen) {
      const g = available.find((x) => x.jid === jid);
      try {
        const r = await poster('/group-rotators/group-invite', {
          connection_id: form.connection_id,
          group_jid: jid,
        });
        novos.push({
          name: g?.name || '',
          invite_url: r.invite_url,
          weight: 1,
          max_clicks: 1000,
          group_jid: jid,
        });
      } catch {
        falhas.push(g?.name || jid);
      }
    }

    setForm((f) => {
      // Não duplica grupo que já está na lista.
      const jaTem = new Set(f.form_targets.map((t) => t.group_jid).filter(Boolean));
      const semVazios = f.form_targets.filter((t) => t.invite_url.trim() !== '');
      const merged = [...semVazios, ...novos.filter((n) => !jaTem.has(n.group_jid))];
      const ordered = merged.map((t, i) => ({ ...t, priority: i }));
      return {
        ...f,
        form_targets: f.distribution === 'WEIGHTED' ? redistributeEqual(ordered) : ordered,
      };
    });

    setImporting(false);
    if (falhas.length) {
      setPickerError(`Sem link de convite para: ${falhas.join(', ')}. O número precisa ser admin do grupo.`);
    } else {
      setPickerOpen(false);
    }
  };

  const resetCounter = async (targetId: string) => {
    if (!form.id) return;
    if (!confirm('Zerar o contador de cliques deste grupo? Ele volta ao pool.')) return;
    await poster(`/group-rotators/${form.id}/targets/${targetId}/reset`, {});
    setForm((f) => ({
      ...f,
      form_targets: f.form_targets.map((t) => (t.id === targetId ? { ...t, clicks_count: 0 } : t)),
    }));
  };

  const validTargets = form.form_targets.filter((t) => INVITE_RE.test(t.invite_url.trim()));
  const weightTotal = form.form_targets.reduce((s, t) => s + t.weight, 0);
  const weightError = form.distribution === 'WEIGHTED' && form.form_targets.length > 0 && weightTotal !== 100;
  const noValidTarget = validTargets.length === 0;

  const save = async () => {
    if (weightError || noValidTarget || !form.name) return;
    const payload = {
      name: form.name,
      distribution: form.distribution,
      utm_source: form.utm_source,
      utm_medium: form.utm_medium,
      utm_campaign: form.utm_campaign,
      use_landing: form.use_landing ?? false,
      landing_logo: form.landing_logo || null,
      landing_title: form.landing_title || null,
      landing_cta: form.landing_cta || null,
      redirect_seconds: form.redirect_seconds ?? 3,
      meta_pixel_id: form.meta_pixel_id || null,
      meta_capi_token: form.meta_capi_token || null,
      gtm_id: form.gtm_id || null,
      connection_id: form.connection_id || null,
      targets: form.form_targets
        .filter((t) => INVITE_RE.test(t.invite_url.trim()))
        .map((t, i) => ({
          name: t.name,
          invite_url: t.invite_url.trim(),
          weight: t.weight,
          priority: i,
          max_clicks: t.max_clicks,
          group_jid: t.group_jid ?? null,
        })),
    };
    if (form.id) await putter(`/group-rotators/${form.id}`, payload);
    else await poster('/group-rotators', payload);
    setOpen(false);
    setForm(empty);
    load();
  };

  const del = async (id: string) => {
    if (!confirm('Excluir rotador de grupos?')) return;
    await deleter(`/group-rotators/${id}`);
    load();
  };

  const toggleActive = async (r: GroupRotator) => {
    await putter(`/group-rotators/${r.id}`, { active: !r.active });
    load();
  };

  const fetchClicks = async (id: string, from: string, to: string) => {
    setClicksLoading(true);
    try {
      const params = new URLSearchParams({ take: '200' });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      setClicks(await fetcher(`/group-rotators/${id}/clicks?${params}`));
    } finally {
      setClicksLoading(false);
    }
  };

  const fetchMembers = async (rotatorId: string) => {
    setMembersLoading(true);
    try {
      setMemberStats(await fetcher(`/group-rotators/${rotatorId}/members`));
    } finally {
      setMembersLoading(false);
    }
  };

  const openMembers = (r: GroupRotator) => {
    setMembersTitle(r.name);
    setMembersRotatorId(r.id);
    setMembersConnectionId(r.connection_id ?? null);
    setMemberStats(null);
    setResolveMsg(null);
    setMembersOpen(true);
    fetchMembers(r.id);
  };

  // Preenche o group_jid dos grupos que ainda não têm. Sem ele o evento de
  // entrada chega mas não sabe a que grupo pertence.
  const resolveJids = async () => {
    if (!membersRotatorId) return;
    setResolving(true);
    setResolveMsg(null);
    try {
      const r = await poster(`/group-rotators/${membersRotatorId}/resolve-jids`, {});
      // "Nada resolveu" com número escolhido só tem uma causa provável: aquele
      // número não participa dos grupos. As outras causas o backend devolve
      // como 400 com mensagem própria, e caem no catch.
      setResolveMsg(
        r.resolved > 0
          ? `${r.resolved} grupo(s) vinculado(s).`
          : 'Nenhum grupo novo vinculado. O número escolhido precisa ser participante/admin destes grupos.'
      );
      await fetchMembers(membersRotatorId);
    } catch (e: any) {
      setResolveMsg(e?.message || 'Falha ao vincular os grupos.');
    } finally {
      setResolving(false);
    }
  };

  const openClicks = (r: GroupRotator) => {
    setClicksTitle(r.name);
    setClicksRotatorId(r.id);
    setDateFrom('');
    setDateTo('');
    setClicksOpen(true);
    fetchClicks(r.id, '', '');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Rotadores de Grupos</h2>
          <p className="text-sm text-gray-500">Distribua os cliques de 1 anúncio entre vários links de grupo do WhatsApp.</p>
        </div>
        <Button onClick={openNew} className="bg-[#0095FF] text-white">
          <Plus className="w-4 h-4 mr-1" /> Novo Rotador de Grupo
        </Button>
      </div>

      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Link do anúncio</TableHead>
              <TableHead>Distribuição</TableHead>
              <TableHead className="text-center">Grupos</TableHead>
              <TableHead className="text-center">Cliques</TableHead>
              <TableHead className="text-center">Membros</TableHead>
              <TableHead className="text-center">Pixel</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12">Carregando...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-gray-500">Nenhum rotador de grupo cadastrado.</TableCell></TableRow>
            ) : items.map((r) => {
              const base = PUBLIC_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : '');
              const directUrl = `${base}/g/${r.short_code}`;
              const metaUrl = `${base}/g/chat/${r.short_code}`;
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
                  <TableCell><Badge variant="secondary">{DIST_LABELS[r.distribution] || r.distribution}</Badge></TableCell>
                  <TableCell className="text-center">{r._count?.targets ?? 0}</TableCell>
                  <TableCell className="text-center">
                    <Button size="sm" variant="ghost" className="gap-1 text-gray-600 hover:text-gray-900" onClick={() => openClicks(r)}>
                      <MousePointerClick className="w-3 h-3" />
                      {r._count?.clicks ?? 0}
                    </Button>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button size="sm" variant="ghost" className="gap-1 text-gray-600 hover:text-gray-900" onClick={() => openMembers(r)}>
                      <Users className="w-3 h-3" />
                      ver
                    </Button>
                  </TableCell>
                  <TableCell className="text-center">
                    {r.meta_pixel_id
                      ? <Badge variant="outline" className="text-[10px] font-mono bg-purple-50 text-purple-700 border-purple-200">{r.meta_pixel_id}</Badge>
                      : <span className="text-xs text-gray-400">workspace</span>}
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
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4" /> {form.id ? 'Editar' : 'Novo'} Rotador de Grupo
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="geral" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="shrink-0 grid grid-cols-4 w-full">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="grupos">Grupos</TabsTrigger>
              <TabsTrigger value="pixel">Pixel</TabsTrigger>
              <TabsTrigger value="landing">Landing</TabsTrigger>
            </TabsList>

            {/* TAB 1 — Geral */}
            <TabsContent value="geral" className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div>
                <Label>Nome</Label>
                <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Grupo VIP Verão" />
              </div>

              <div>
                <Label>Distribuição de cliques</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.keys(DIST_LABELS).map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      size="sm"
                      variant={form.distribution === mode ? 'default' : 'outline'}
                      onClick={() => setForm((f) => ({
                        ...f,
                        distribution: mode,
                        form_targets: mode === 'WEIGHTED' ? redistributeEqual(f.form_targets) : f.form_targets,
                      }))}
                    >
                      {DIST_LABELS[mode]}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {form.distribution === 'ROUND_ROBIN' && 'Reveza entre os grupos: 1º clique→grupo 1, 2º→grupo 2, volta ao início.'}
                  {form.distribution === 'WEIGHTED' && 'Defina a % de cada grupo. Total deve ser exatamente 100%.'}
                  {form.distribution === 'FALLBACK' && 'Tudo vai pro grupo 1 até ele lotar (limite de cliques). Aí o próximo assume. Use ↑↓ pra ordenar.'}
                </p>
              </div>

              <div>
                <Label>Número que lê os grupos</Label>
                <select
                  value={form.connection_id || ''}
                  onChange={(e) => setForm({ ...form, connection_id: e.target.value || null })}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
                >
                  <option value="">Nenhum — sem contagem de membros</option>
                  {evolutionConns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.profile_name || c.session_name}
                      {c.phone_number ? ` · ${c.phone_number}` : ''}
                      {c.status !== 'CONNECTED' ? ' (desconectado)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Este número <strong>não</strong> recebe os cliques — o rotador manda direto pro grupo.
                  Ele só serve pra contar quem entrou, e pra isso precisa ser <strong>admin de todos os grupos</strong>.
                  {evolutionConns.length === 0 && ' Nenhum número Evolution cadastrado: a contagem exige Evolution, a uazapi não expõe os dados do grupo.'}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div><Label>utm_source</Label><Input value={form.utm_source || ''} onChange={(e) => setForm({ ...form, utm_source: e.target.value })} /></div>
                <div><Label>utm_medium</Label><Input value={form.utm_medium || ''} onChange={(e) => setForm({ ...form, utm_medium: e.target.value })} /></div>
                <div><Label>utm_campaign</Label><Input value={form.utm_campaign || ''} onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })} /></div>
              </div>
              <p className="text-xs text-gray-400">Usados como fallback quando a URL do anúncio não traz UTM.</p>
            </TabsContent>

            {/* TAB 2 — Grupos */}
            <TabsContent value="grupos" className="flex-1 overflow-y-auto space-y-3 pr-1">
              {/* Escolher da lista evita a ida ao celular pra copiar link por
                  link, e já traz o group_jid — sem ele a contagem de membros
                  exige um passo extra depois de salvar. */}
              {form.connection_id ? (
                <Button type="button" variant="outline" className="w-full gap-2" onClick={openPicker}>
                  <Users className="w-4 h-4" />
                  Escolher grupos do número
                </Button>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs text-amber-800">
                    Escolha um número na aba <strong>Geral</strong> para listar os grupos dele aqui.
                    Sem isso, só colando o link do convite na mão.
                  </p>
                </div>
              )}

              <div className="border rounded-lg p-3 bg-blue-50 border-blue-200">
                <p className="text-xs text-blue-700">
                  Ou cole o link do convite (<code>chat.whatsapp.com/XXXX</code>). Um grupo só já funciona.
                  O <strong>limite de cliques</strong> tira o grupo do rodízio quando ele lota — deixe vazio pra não limitar.
                </p>
              </div>

              {form.form_targets.map((t, idx) => {
                const invalid = t.invite_url.trim() !== '' && !INVITE_RE.test(t.invite_url.trim());
                const full = t.max_clicks != null && (t.clicks_count ?? 0) >= t.max_clicks;
                return (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-500 shrink-0">#{idx + 1}</span>
                      <Input
                        value={t.name}
                        onChange={(e) => setTarget(idx, { name: e.target.value })}
                        placeholder="Apelido do grupo (opcional)"
                        className="h-8 text-sm"
                      />
                      {form.distribution === 'FALLBACK' && (
                        <div className="flex flex-col gap-0 shrink-0">
                          <Button type="button" size="sm" variant="ghost" className="h-5 w-6 p-0" onClick={() => moveTarget(idx, -1)} disabled={idx === 0}><ChevronUp className="w-3 h-3" /></Button>
                          <Button type="button" size="sm" variant="ghost" className="h-5 w-6 p-0" onClick={() => moveTarget(idx, 1)} disabled={idx === form.form_targets.length - 1}><ChevronDown className="w-3 h-3" /></Button>
                        </div>
                      )}
                      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => removeTarget(idx)}>
                        <X className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>

                    <Input
                      value={t.invite_url}
                      onChange={(e) => setTarget(idx, { invite_url: e.target.value })}
                      placeholder="https://chat.whatsapp.com/XXXXXXXXXXXXXXX"
                      className={`h-8 text-sm font-mono ${invalid ? 'border-red-400' : ''}`}
                    />
                    {invalid && <p className="text-xs text-red-500">Link de convite inválido.</p>}
                    {t.group_jid && (
                      <p className="text-[11px] text-green-700">
                        ✓ Grupo vinculado — contagem de membros já ativa ao salvar
                      </p>
                    )}

                    <div className="flex items-end gap-3">
                      {form.distribution === 'WEIGHTED' && (
                        <div>
                          <Label className="text-xs">Peso (%)</Label>
                          <Input
                            type="number" min={1} max={100}
                            value={t.weight}
                            onChange={(e) => setTarget(idx, { weight: Math.min(100, Math.max(1, parseInt(e.target.value) || 1)) })}
                            className="h-7 w-20 text-sm"
                          />
                        </div>
                      )}
                      <div>
                        <Label className="text-xs">Limite de cliques</Label>
                        <Input
                          type="number" min={1}
                          value={t.max_clicks ?? ''}
                          onChange={(e) => setTarget(idx, { max_clicks: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value) || 1) })}
                          placeholder="sem limite"
                          className="h-7 w-28 text-sm"
                        />
                      </div>
                      {t.id && (
                        <div className="flex items-center gap-2 pb-0.5">
                          <Badge variant="outline" className={`text-xs ${full ? 'bg-red-50 text-red-600 border-red-200' : 'text-gray-600'}`}>
                            {t.clicks_count ?? 0}{t.max_clicks != null ? ` / ${t.max_clicks}` : ''}{full ? ' — cheio' : ''}
                          </Badge>
                          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" title="Zerar contador" onClick={() => resetCounter(t.id!)}>
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <Button type="button" variant="outline" size="sm" onClick={addTarget} className="w-full">
                <Plus className="w-3 h-3 mr-1" /> Adicionar grupo
              </Button>

              {form.distribution === 'WEIGHTED' && form.form_targets.length > 0 && (
                <div className={`text-xs font-medium ${weightTotal === 100 ? 'text-green-600' : 'text-red-500'}`}>
                  Total: {weightTotal}%{weightTotal === 100 ? ' ✓' : weightTotal < 100 ? ` — faltam ${100 - weightTotal}%` : ` — excede em ${weightTotal - 100}%`}
                </div>
              )}
            </TabsContent>

            {/* TAB 3 — Pixel */}
            <TabsContent value="pixel" className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div className="border rounded-lg p-3 bg-purple-50 border-purple-200">
                <p className="text-xs text-purple-700">
                  Pixel próprio deste rotador. Deixe <strong>vazio</strong> pra usar o pixel configurado no workspace.
                </p>
              </div>
              <div>
                <Label>Pixel ID (Meta)</Label>
                <Input value={form.meta_pixel_id || ''} onChange={(e) => setForm({ ...form, meta_pixel_id: e.target.value })} placeholder="123456789012345" className="font-mono" />
              </div>
              <div>
                <Label>Token da CAPI</Label>
                <Input type="password" value={form.meta_capi_token || ''} onChange={(e) => setForm({ ...form, meta_capi_token: e.target.value })} placeholder="EAAG..." className="font-mono" />
                <p className="text-xs text-gray-400 mt-1">Sem o token, só o pixel do navegador dispara (sem CAPI server-side).</p>
              </div>
              <div>
                <Label>GTM ID</Label>
                <Input value={form.gtm_id || ''} onChange={(e) => setForm({ ...form, gtm_id: e.target.value })} placeholder="GTM-XXXXXX" className="font-mono" />
              </div>
            </TabsContent>

            {/* TAB 4 — Landing Page */}
            <TabsContent value="landing" className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div className="border rounded-lg p-3 bg-blue-50 border-blue-200">
                <p className="text-xs text-blue-700">O link <strong>Meta</strong> (<code>/g/chat/xxx</code>) sempre abre a landing page — com <strong>contagem regressiva</strong> que redireciona sozinho (ou só botão, se marcar a opção abaixo). O link <strong>Direto</strong> (<code>/g/xxx</code>) segue o ajuste abaixo.</p>
              </div>

              <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                <Checkbox checked={!!form.use_landing} onCheckedChange={(v) => setForm({ ...form, use_landing: !!v })} />
                <div>
                  <span className="text-sm font-medium">Usar landing page no link direto (com botão)</span>
                  <p className="text-xs text-gray-500 mt-0.5">Marcado: os dois links abrem a landing com <strong>botão</strong>. Desmarcado: o link Direto entra no grupo <strong>na hora</strong>, e o link Meta abre a landing com <strong>contagem regressiva</strong>.</p>
                </div>
              </label>

              <div>
                <Label>Segundos até redirecionar</Label>
                <Input
                  type="number" min={0} max={60}
                  value={form.redirect_seconds ?? 3}
                  onChange={(e) => setForm({ ...form, redirect_seconds: e.target.value === '' ? 3 : Math.max(0, Math.min(60, Number(e.target.value))) })}
                  className="mt-1 w-32"
                />
                <p className="text-xs text-gray-400 mt-1">Tempo na landing antes de abrir o grupo. 0 = imediato.</p>
              </div>

              <div>
                <Label>Logo da empresa</Label>
                <div className="mt-1 flex items-center gap-3">
                  {form.landing_logo ? (
                    <div className="relative">
                      <img src={form.landing_logo} alt="Logo" className="h-14 w-auto max-w-[120px] object-contain rounded border" />
                      <Button type="button" size="sm" variant="ghost" className="absolute -top-2 -right-2 h-5 w-5 p-0 rounded-full bg-red-100 hover:bg-red-200" onClick={() => setForm({ ...form, landing_logo: '' })}><X className="w-3 h-3 text-red-500" /></Button>
                    </div>
                  ) : (
                    <div className="h-14 w-24 border-2 border-dashed rounded flex items-center justify-center text-gray-400 text-xs">Sem logo</div>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                    <Upload className="w-3 h-3 mr-1" /> Upload
                  </Button>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </div>
                <p className="text-xs text-gray-400 mt-1">Máx 300KB. PNG/JPG/SVG.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Título da página</Label>
                  <Input value={form.landing_title || ''} onChange={(e) => setForm({ ...form, landing_title: e.target.value })} placeholder="Entre no nosso grupo" className="mt-1" />
                </div>
                <div>
                  <Label>Texto do botão</Label>
                  <Input value={form.landing_cta || ''} onChange={(e) => setForm({ ...form, landing_cta: e.target.value })} placeholder="👥 Entrar no grupo" className="mt-1" />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="shrink-0 border-t pt-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={save}
              disabled={weightError || noValidTarget || !form.name}
              title={weightError ? 'Total deve ser 100%' : noValidTarget ? 'Informe ao menos 1 link de grupo válido' : ''}
            >
              Salvar
            </Button>
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
      {/* Escolher grupos do número */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4" /> Grupos do número
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {/* Lista inteira desabilitada sem explicação parece tela quebrada.
                Diz o que fazer antes de o usuário sair procurando. */}
            {!picking && available.length > 0 && adminCount === 0 && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs leading-relaxed text-amber-800">
                  Este número está em <strong>{available.length} grupos</strong>, mas não é admin de
                  nenhum — por isso nada abaixo pode ser escolhido. Promova o número a admin no
                  WhatsApp e busque de novo, ou cole o link do convite na mão.
                </p>
              </div>
            )}

            {picking ? (
              <p className="py-8 text-center text-sm text-gray-500">
                Buscando grupos... isso pode levar até um minuto em contas com muitos grupos.
              </p>
            ) : available.length === 0 && !pickerError ? (
              <p className="py-8 text-center text-sm text-gray-500">
                Este número não está em nenhum grupo.
              </p>
            ) : (
              <div className="space-y-1">
                {available.map((g) => {
                  const marcado = chosen.has(g.jid);
                  return (
                    <label
                      key={g.jid}
                      className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                        g.is_admin
                          ? 'cursor-pointer hover:bg-gray-50'
                          : 'cursor-not-allowed border-gray-100 bg-gray-50/60'
                      } ${marcado ? 'border-blue-300 bg-blue-50/60' : ''}`}
                    >
                      <Checkbox
                        checked={marcado}
                        disabled={!g.is_admin}
                        onCheckedChange={(v) =>
                          setChosen((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(g.jid);
                            else next.delete(g.jid);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${g.is_admin ? 'text-gray-800' : 'text-gray-400'}`}>
                          {g.name}
                        </span>
                        <span className="block text-[11px] text-gray-400">
                          {g.size} participante{g.size === 1 ? '' : 's'}
                          {/* Diz POR QUE não dá pra escolher, senão o usuário
                              acha que o grupo sumiu ou que a tela travou. */}
                          {!g.is_admin && ' · o número não é admin deste grupo'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {pickerError && (
              <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{pickerError}</p>
            )}
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancelar</Button>
            <Button onClick={importChosen} disabled={chosen.size === 0 || importing}>
              {importing ? 'Buscando links...' : `Adicionar ${chosen.size || ''}`.trim()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Membros por grupo */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[88vh] overflow-y-auto p-0">
          <div className="p-6 border-b sticky top-0 bg-white z-10">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-4 h-4" /> Membros — {membersTitle}
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-4 gap-2 mt-4">
              {[
                { label: 'Cliques', value: memberStats?.totals.clicks ?? 0, cls: 'text-gray-900' },
                { label: 'Entraram', value: memberStats?.totals.joined_total ?? 0, cls: 'text-blue-600' },
                { label: 'Dentro agora', value: memberStats?.totals.members ?? 0, cls: 'text-green-600' },
                { label: 'Sem grupo', value: memberStats?.totals.unattributed_joins ?? 0, cls: 'text-amber-600' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border bg-gray-50/50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">{s.label}</p>
                  <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={resolveJids} disabled={resolving || !membersConnectionId} className="gap-1">
                <RotateCcw className={`w-3 h-3 ${resolving ? 'animate-spin' : ''}`} />
                {resolving ? 'Vinculando...' : 'Vincular grupos'}
              </Button>
              {resolveMsg && <span className="text-xs text-gray-600">{resolveMsg}</span>}
            </div>
          </div>

          <div className="p-6 pt-4">
            {/* A contagem depende de 3 coisas que falham caladas — avisar aqui evita
                o usuário achar que o recurso está quebrado. */}
            {/* Separa "falta escolher número" de "número não é admin": são causas
                diferentes e antes as duas apareciam com a mesma frase. */}
            {!membersConnectionId ? (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800 leading-relaxed">
                  Este rotador não tem número escolhido, então não há como contar quem entrou.
                  Abra <strong>Editar → Geral</strong> e escolha o número que lê os grupos.
                  Os cliques continuam sendo contados normalmente.
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                A contagem exige que o número escolhido seja <strong>admin de cada grupo</strong>.
                Grupos onde ele não entrou aparecem como "não vinculado" abaixo.
              </p>
            )}

            {membersLoading ? (
              <p className="text-center py-8 text-gray-500">Carregando...</p>
            ) : !memberStats || memberStats.targets.length === 0 ? (
              <p className="text-center py-8 text-gray-500">Nenhum grupo cadastrado.</p>
            ) : (
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead>Grupo</TableHead>
                    <TableHead className="text-center">Cliques</TableHead>
                    <TableHead className="text-center">Entraram</TableHead>
                    <TableHead className="text-center">Dentro agora</TableHead>
                    <TableHead className="text-center">Rastreio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memberStats.targets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{t.name || 'Sem nome'}</p>
                        <code className="text-[11px] text-gray-400">{t.invite_url.replace('https://chat.whatsapp.com/', '')}</code>
                      </TableCell>
                      <TableCell className="text-center">{t.clicks_count}</TableCell>
                      <TableCell className="text-center">{t.tracking_ready ? t.joined_total : '—'}</TableCell>
                      <TableCell className="text-center font-medium">{t.tracking_ready ? t.members : '—'}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={t.tracking_ready
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'}
                        >
                          {t.tracking_ready ? 'ativo' : 'não vinculado'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={clicksOpen} onOpenChange={setClicksOpen}>
        <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[88vh] overflow-y-auto p-0">
          <div className="p-6 border-b sticky top-0 bg-white z-10">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MousePointerClick className="w-4 h-4" /> Cliques — {clicksTitle}
              </DialogTitle>
            </DialogHeader>

            {(() => {
              const total = clicks.length;
              const meta = clicks.filter((c) => !!c.fbclid).length;
              const grupos = new Set(clicks.map((c) => c.target?.invite_url).filter(Boolean)).size;
              const stats = [
                { label: 'Total', value: total, cls: 'text-gray-900' },
                { label: 'Via Meta', value: meta, cls: 'text-blue-600' },
                { label: 'Grupos usados', value: grupos, cls: 'text-gray-900' },
              ];
              return (
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {stats.map((s) => (
                    <div key={s.label} className="rounded-lg border bg-gray-50/50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">{s.label}</p>
                      <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="mt-4 flex flex-wrap items-end gap-2">
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
          </div>

          <div className="p-6 pt-3">
            {clicksLoading ? (
              <p className="text-sm text-gray-500 text-center py-10">Carregando...</p>
            ) : clicks.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">Nenhum clique no período.</p>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Data</TableHead>
                      <TableHead className="whitespace-nowrap">Origem</TableHead>
                      <TableHead className="whitespace-nowrap">Grupo</TableHead>
                      <TableHead className="whitespace-nowrap">Disp.</TableHead>
                      <TableHead className="whitespace-nowrap">Campanha</TableHead>
                      <TableHead className="whitespace-nowrap">Conjunto</TableHead>
                      <TableHead className="whitespace-nowrap">Anúncio</TableHead>
                      <TableHead className="whitespace-nowrap">fbclid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clicks.map((c) => {
                      const src = trafficSource(c);
                      return (
                        <TableRow key={c.id} className="align-top">
                          <TableCell className="text-xs text-gray-600 whitespace-nowrap">
                            {new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell><Badge variant="outline" className={`text-xs ${src.cls}`}>{src.label}</Badge></TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{c.target?.name || c.target?.invite_url?.split('/').pop() || '—'}</TableCell>
                          <TableCell className="text-xs text-gray-500">{deviceFromUA(c.user_agent)}</TableCell>
                          <TableCell className="max-w-[200px]"><ExpandableValue value={c.utm_campaign} max={20} mono={false} /></TableCell>
                          <TableCell className="max-w-[200px]"><ExpandableValue value={c.utm_term} max={20} mono={false} /></TableCell>
                          <TableCell className="max-w-[200px]"><ExpandableValue value={c.utm_content} max={20} mono={false} /></TableCell>
                          <TableCell className="max-w-[220px]"><ExpandableValue value={c.fbclid || c.gclid} max={20} copyable /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
