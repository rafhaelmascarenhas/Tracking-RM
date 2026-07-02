import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Link as LinkIcon,
  Shuffle,
  MessageCircle,
  Filter,
  MousePointerClick,
  Code,
  Globe,
  Users,
  FileText,
  PieChart,
  HelpCircle,
  LifeBuoy,
  Lightbulb,
  Smartphone,
  Settings,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/numbers', label: 'Números', icon: Smartphone },
  { href: '/conversations', label: 'Conversas', icon: MessageSquare },
  { href: '/links', label: 'Links Rastreáveis', icon: LinkIcon },
  { href: '/rotators', label: 'Rotadores de Números', icon: Shuffle },
  { href: '/messages', label: 'Mensagens Rastreáveis', icon: MessageCircle },
  { href: '/journey', label: 'Jornada de Compra', icon: Filter },
  { href: '/events', label: 'Eventos de Conversão', icon: MousePointerClick },
  { href: '/pixels', label: 'Disparos de Pixel', icon: Code },
  { href: '/triggers', label: 'Gatilhos de Conversão', icon: MousePointerClick },
  { href: '/webhooks', label: 'Disparos de Webhook', icon: Globe },
  { href: '/team', label: 'Acessos do Cliente', icon: Users },
  { href: '/client-info', label: 'Informações do Cliente', icon: FileText },
  { href: '/help', label: 'Central de Ajuda', icon: HelpCircle },
  { href: '/support', label: 'Suporte', icon: LifeBuoy },
  { href: '/suggest', label: 'Sugira Funcionalidades', icon: Lightbulb },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

export function Layout() {
  const location = useLocation();

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  return (
    <div className="flex h-screen bg-[#F0F2F5] overflow-hidden text-gray-800 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[#E5E5EA] flex flex-col flex-shrink-0 z-10">
        <div className="p-4 flex items-center h-16 border-b border-[#E5E5EA]/50">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center mr-3 shadow-md">
             <span className="text-white font-bold text-sm tracking-tighter">RM</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 tracking-tight">
            RM App
          </h1>
        </div>
        
        <div className="flex-1 overflow-y-auto w-full py-4 space-y-1">
          <nav className="flex-1 px-3 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                    isActive 
                      ? "bg-blue-50 text-blue-600 font-medium shadow-[0_1px_3px_rgba(0,0,0,0.02)]" 
                      : "text-gray-500 font-medium hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-blue-600" : "text-gray-400")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-[#E5E5EA]/50">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0 text-gray-400" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#F5F5F7]">
        {/* Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-[#E5E5EA] flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-4">
             <h2 className="text-[17px] font-semibold text-gray-900 capitalize tracking-tight">
                {navItems.find(item => location.pathname.startsWith(item.href))?.label || 'Dashboard'}
             </h2>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 bg-green-50/80 text-green-700 px-3 py-1.5 rounded-full text-xs font-semibold border border-green-200/50 shadow-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                Conectado
             </div>
             
             <div className="h-5 w-[1px] bg-gray-200"></div>
             
             <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 border border-gray-200/50 flex items-center justify-center text-gray-600 text-[10px] font-bold shadow-sm">
                  User
                </div>
             </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto w-full overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
