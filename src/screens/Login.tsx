import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export function Login() {
  const { user, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    const { error: err } = await signInWithEmail(trimmed);
    setSubmitting(false);
    if (err) setError(err);
    else setSent(true);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-md p-4">
        <PageHeader title="Sign in" back="/" />
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a one-tap sign-in link. No password required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              {error && <Banner kind="error">{error}</Banner>}
              {sent && (
                <Banner kind="success">
                  Check your inbox. Tap the link on this device to finish signing in.
                </Banner>
              )}

              <Button type="submit" disabled={submitting} size="xl" className="w-full">
                {submitting ? 'Sending…' : 'Send sign-in link'}
              </Button>

              <p className="text-xs text-muted-foreground">
                You&apos;ll start as a contributor. An admin can promote you later.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
