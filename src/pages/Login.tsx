import { useState } from 'react';
import * as React from 'react';
import { supabase } from '@/lib/supabase';
import { loginWithPassword } from '@/lib/panelAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUP, setIsSignUp] = useState(false);

  // Painel single-tenant: sem Supabase o acesso e por senha unica, validada no
  // backend. Antes esse caminho era um mock que mandava qualquer visitante
  // direto pro /dashboard.
  const passwordOnly = !supabase;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (passwordOnly) {
        await loginWithPassword(password);
        window.location.href = '/dashboard';
        return;
      }

      if (isSignUP) {
        const { error } = await supabase!.auth.signUp({ email, password });
        if (error) throw error;
        alert('Check your email for the login link!');
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || 'Falha no login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">WaTrack</CardTitle>
          <CardDescription>
            WhatsApp Conversion Tracker for Meta & Google Ads
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleAuth}>
          <CardContent className="space-y-4">
            {!passwordOnly && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">{passwordOnly ? 'Senha de acesso' : 'Password'}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus={passwordOnly}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col space-y-3">
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? 'Processing...' : passwordOnly ? 'Entrar' : isSignUP ? 'Sign Up' : 'Sign In'}
            </Button>
            {!passwordOnly && (
              <Button
                type="button"
                variant="link"
                className="text-sm text-muted-foreground w-full"
                onClick={() => setIsSignUp(!isSignUP)}
              >
                {isSignUP ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
