-- Trailing stops per open positie.
--
-- Punt 15 van de rij. De rekenregel staat in src/lib/trading/advancedOrders.ts;
-- dit is waar de instelling woont. `mt5_positions` kon het niet zijn: die
-- tabel wordt vanuit MetaApi gevuld en niet door ons geschreven, dus een
-- kolom erbij zou bij de volgende sync weer weg zijn.
--
-- Eén rij per positie. De positie-id komt van MT5 en is tekst, net als in
-- mt5_positions.
--
-- RLS gaat in dezelfde uitvoering aan als de tabel wordt aangemaakt. Zie de
-- harde grens in docs/AUTOPILOT.md: een tabel zonder policies is dicht, een
-- tabel zonder RLS is open, en falen hoort de veilige kant op te vallen.

CREATE TABLE IF NOT EXISTS public.position_trailing_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_account_id uuid NOT NULL REFERENCES public.user_broker_accounts(id) ON DELETE CASCADE,
  /** MT5-positie-id, als tekst — zo geeft MetaApi hem terug. */
  position_id text NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  /** Hoe ver de stop achter de prijs aan loopt, in prijseenheden. */
  distance numeric NOT NULL CHECK (distance > 0),
  /**
   * De laatste stop die wij gezet hebben.
   *
   * Niet om de broker te geloven op zijn woord, maar om te zien of een
   * modify is aangekomen: staat de stop bij de broker lager dan wat hier
   * staat, dan heeft iemand of iets hem verzet en hoort de bewaker dat te
   * melden in plaats van er stil overheen te schrijven.
   */
  last_set_stop numeric,
  last_moved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (broker_account_id, position_id)
);

CREATE INDEX IF NOT EXISTS position_trailing_stops_sweep_idx
  ON public.position_trailing_stops (broker_account_id, updated_at);

ALTER TABLE public.position_trailing_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trailing_select_own" ON public.position_trailing_stops;
CREATE POLICY "trailing_select_own" ON public.position_trailing_stops
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "trailing_insert_own" ON public.position_trailing_stops;
CREATE POLICY "trailing_insert_own" ON public.position_trailing_stops
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "trailing_update_own" ON public.position_trailing_stops;
CREATE POLICY "trailing_update_own" ON public.position_trailing_stops
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "trailing_delete_own" ON public.position_trailing_stops;
CREATE POLICY "trailing_delete_own" ON public.position_trailing_stops
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- `REVOKE ALL ... FROM PUBLIC` haalt anon er niet af: Supabase geeft elke
-- nieuwe tabel in `public` een eigen grant via ALTER DEFAULT PRIVILEGES.
-- Allebei dus. Zie de harde grens hierover in docs/AUTOPILOT.md.
REVOKE ALL ON TABLE public.position_trailing_stops FROM PUBLIC;
REVOKE ALL ON TABLE public.position_trailing_stops FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.position_trailing_stops TO authenticated;
GRANT ALL ON TABLE public.position_trailing_stops TO service_role;

COMMENT ON TABLE public.position_trailing_stops IS
  'Trailing-stop instelling per open MT5-positie. De bewaker leest dit en verzet de stop via MetaApi.';
