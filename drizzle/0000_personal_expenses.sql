CREATE TABLE personal_expenses (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 100),
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 256),
  source_payload text NOT NULL,
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL CHECK (currency IN ('ARS', 'USD')),
  expense_date date NOT NULL,
  category text CHECK (length(category) BETWEEN 1 AND 100),
  ars_cents bigint CHECK (ars_cents > 0),
  conversion jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_expenses_owner_source_unique UNIQUE (owner_id, source_key),
  CHECK ((currency = 'ARS' AND ars_cents IS NOT NULL AND ars_cents = amount_cents AND conversion IS NULL)
    OR (currency = 'USD' AND ((ars_cents IS NULL AND conversion IS NULL)
      OR (ars_cents IS NOT NULL AND conversion IS NOT NULL))))
);
CREATE TABLE expense_revisions (
  id uuid PRIMARY KEY,
  expense_id uuid NOT NULL REFERENCES personal_expenses(id),
  owner_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_revisions_expense_version_unique UNIQUE (expense_id, version)
);
