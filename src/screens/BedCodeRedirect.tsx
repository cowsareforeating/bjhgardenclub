import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/Spinner';
import { Banner } from '../components/Banner';

/**
 * Resolves a short share code (/b/:code) to its bed and redirects to the bed
 * detail page. Keeps share links short while reusing the existing detail route.
 */
export function BedCodeRedirect() {
  const { code } = useParams<{ code: string }>();
  const nav = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('tree_beds')
        .select('id')
        .eq('code', code)
        .maybeSingle();
      if (cancelled) return;
      if (data?.id) nav(`/bed/${data.id}`, { replace: true });
      else setNotFound(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [code, nav]);

  if (notFound) {
    return (
      <div className="p-4">
        <Banner kind="error">That tree bed link wasn’t found.</Banner>
      </div>
    );
  }
  return <Spinner label="Opening…" />;
}
