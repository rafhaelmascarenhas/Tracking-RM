import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { META_EVENTS } from '@/lib/metaEvents';

// Catálogo read-only dos eventos de conversão disponíveis. A associação de um
// evento a uma etapa é feita em "Jornada de Compra" (dropdown no editor da etapa).
export function ConversionEvents() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Eventos de Conversão</h2>
        <p className="text-sm text-gray-500">
          Eventos disponíveis para associar às etapas em <strong>Jornada de Compra</strong>. Esta página é apenas referência.
        </p>
      </div>

      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Plataforma</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {META_EVENTS.map((ev) => (
              <TableRow key={ev.name}>
                <TableCell className="text-[#0095FF] font-semibold">Meta</TableCell>
                <TableCell className="font-medium">{ev.name}</TableCell>
                <TableCell className="text-gray-500">{ev.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
