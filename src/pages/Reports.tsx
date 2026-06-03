import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlayCircle, MessageSquare, Box, Download, FileText } from 'lucide-react';

export function Reports() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
         <div className="w-64 h-36 bg-gray-900 rounded-lg shrink-0 relative overflow-hidden group cursor-pointer flex items-center justify-center">
            <div className="absolute inset-0 opacity-50 bg-black"></div>
            <PlayCircle className="w-12 h-12 text-red-500 relative z-10" />
            <div className="absolute bottom-2 left-2 text-white text-xs font-bold leading-tight z-10">
               [TINTIM] RELATÓRIOS E ...
            </div>
         </div>
         
         <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-2">
               <span className="text-xl">✨</span> Gere e exporte relatórios para analisar as conversas em ...
            </h2>
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
               <li>Exporte dados das mensagens para analisar resultados onde e como você preferir.</li>
               <li>Exporte suas conversões e envie offline no Google Ads.</li>
            </ul>
            <p className="text-sm text-gray-500 mt-4">
               Precisa de ajuda? <a href="#" className="text-blue-500 hover:underline">Fale agora com o suporte</a>
            </p>
         </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
         <Button variant="outline" className="h-auto flex flex-col items-center justify-center gap-2 p-6 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800">
            <MessageSquare className="w-8 h-8" />
            <span className="font-semibold text-center whitespace-normal">Conversas</span>
         </Button>
         <Button variant="outline" className="h-auto flex flex-col items-center justify-center gap-2 p-6 border-gray-200 text-gray-700 hover:bg-gray-50">
            <div className="w-8 h-8 rounded-full border-4 border-yellow-400 border-l-green-500 border-t-red-500 border-b-blue-500"></div>
            <span className="font-semibold text-center whitespace-normal">Conversões Offline com GCLID</span>
         </Button>
         <Button variant="outline" className="h-auto flex flex-col items-center justify-center gap-2 p-6 border-gray-200 text-gray-700 hover:bg-gray-50">
            <Box className="w-8 h-8" />
            <span className="font-semibold text-center whitespace-normal">Histórico de Alterações da Jornada de Compra</span>
         </Button>
         <Button variant="outline" className="h-auto flex flex-col items-center justify-center gap-2 p-6 border-gray-200 text-gray-700 hover:bg-gray-50">
            <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center">
               <span className="text-xl">$</span>
            </div>
            <span className="font-semibold text-center whitespace-normal">Histórico de Vendas</span>
         </Button>
      </div>

      <div>
         <h3 className="text-lg font-bold text-gray-800 mb-4">Histórico</h3>
         <Card className="border-gray-200 shadow-sm overflow-hidden">
           <Table>
             <TableHeader className="bg-gray-50/50">
               <TableRow>
                 <TableHead className="font-semibold">Data</TableHead>
                 <TableHead className="font-semibold">Tipo</TableHead>
                 <TableHead className="font-semibold">Status do processamento</TableHead>
                 <TableHead className="text-right font-semibold">Download</TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
                <TableRow>
                   <TableCell className="text-gray-600">02/05/2026 12:47:06</TableCell>
                   <TableCell className="text-gray-800">Conversas</TableCell>
                   <TableCell>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700">
                         <span className="w-2 h-2 rounded-full bg-green-500"></span> Concluído
                      </span>
                   </TableCell>
                   <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-blue-500 hover:text-blue-700 hover:bg-blue-50">
                         Baixar arquivo
                      </Button>
                   </TableCell>
                </TableRow>
             </TableBody>
           </Table>
         </Card>
      </div>
    </div>
  );
}
