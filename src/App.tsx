import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Conversations } from './pages/Conversations';
import { TrackableLinks } from './pages/TrackableLinks';
import { Rotators } from './pages/Rotators';
import { TrackableMessages } from './pages/TrackableMessages';
import { PurchaseJourney } from './pages/PurchaseJourney';
import { ConversionEvents } from './pages/ConversionEvents';
import { Triggers } from './pages/Triggers';
import { WebhookTriggers } from './pages/WebhookTriggers';
import { ClientAccess } from './pages/ClientAccess';
import { ClientInfo } from './pages/ClientInfo';
import { Reports } from './pages/Reports';
import { HelpCenter } from './pages/HelpCenter';
import { Support } from './pages/Support';
import { SuggestFeatures } from './pages/SuggestFeatures';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { Numbers } from './pages/Numbers';
import { NumberDetails } from './pages/NumberDetails';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // If no Supabase config is found, we fall back to a mock session
  // so the dashboard UI is still visible in preview.
  const isMock = !import.meta.env.VITE_SUPABASE_URL;

  useEffect(() => {
    if (isMock || !supabase) {
      setSession({ user: { email: 'demo@example.com' } });
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription?.unsubscribe();
  }, [isMock]);

  if (loading) return null;

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="numbers" element={<Numbers />} />
        <Route path="numbers/:id" element={<NumberDetails />} />
        <Route path="conversations" element={<Conversations />} />
        <Route path="links" element={<TrackableLinks />} />
        <Route path="rotators" element={<Rotators />} />
        <Route path="messages" element={<TrackableMessages />} />
        <Route path="journey" element={<PurchaseJourney />} />
        <Route path="events" element={<ConversionEvents />} />
        <Route path="pixels" element={<Triggers />} />
        <Route path="webhooks" element={<WebhookTriggers />} />
        <Route path="team" element={<ClientAccess />} />
        <Route path="client-info" element={<ClientInfo />} />
        <Route path="reports" element={<Reports />} />
        <Route path="help" element={<HelpCenter />} />
        <Route path="support" element={<Support />} />
        <Route path="suggest" element={<SuggestFeatures />} />
        
        {/* Keep settings just in case it's linked elsewhere, but maybe hide from sidebar */}
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Route>
    </Routes>
  );
}
