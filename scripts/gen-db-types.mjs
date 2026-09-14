/**
 * Regenerates src/marketplace/db/types.ts from the LIVE DB2 schema.
 *
 *   npm run gen:types
 *
 * Developer tooling — nobody using the marketplace ever runs this. It exists so
 * the types cannot drift from the database: PostgREST publishes an OpenAPI
 * description of every exposed table at `/rest/v1/`, including each column's
 * type, whether it is NOT NULL, whether it has a default, the values of every
 * enum, and every foreign key. That is exactly what a Row/Insert/Update type
 * needs, so it is read rather than transcribed by hand.
 *
 * Run it after any change to src/marketplace/db/schema.sql that has been
 * applied to the database. If the two disagree, the database wins — this reads
 * what is actually there, not what schema.sql says should be.
 */
import fs from 'node:fs';
import path from 'node:path';

const NL = '\n';
const ENV_FILES = ['.env.local', '.env'];

function readEnv(key) {
  for (const file of ENV_FILES) {
    if (!fs.existsSync(file)) continue;
    const m = fs.readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (m) return m[1].trim();
  }
  return null;
}

const url = readEnv('MARKETPLACE_SUPABASE_URL');
const key = readEnv('MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY');

if (!url || !key) {
  console.error('Missing MARKETPLACE_SUPABASE_URL / MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

/**
 * Postgres type -> TypeScript type.
 *
 * `numeric` becomes `number`, and that is a deliberate simplification worth
 * knowing about: PostgREST sends numeric as a JSON number, so by the time a
 * value reaches this app it already IS a double and any extra precision is
 * already gone. Typing it `string` would describe a wire format this client
 * never sees.
 */
function tsType(prop, enumNames) {
  const fmt = prop.format ?? '';

  if (fmt.endsWith('[]')) {
    return `${tsType({ ...prop, format: fmt.slice(0, -2) }, enumNames)}[]`;
  }

  // public.listing_state and friends.
  if (fmt.startsWith('public.')) {
    const name = fmt.slice('public.'.length);
    if (enumNames.has(name)) return `Database['public']['Enums']['${name}']`;
  }

  if (/^(text|character|character varying|uuid|name)$/.test(fmt)) return 'string';
  if (/^(timestamp|timestamptz|date|time)/.test(fmt)) return 'string';
  if (/^(numeric|integer|bigint|smallint|double precision|real)$/.test(fmt)) return 'number';
  if (fmt === 'boolean') return 'boolean';
  if (fmt === 'jsonb' || fmt === 'json') return 'Json';

  // Nothing recognised the column, so say so rather than silently widening it
  // to `any` and letting a wrong assumption compile.
  return 'unknown';
}

/**
 * The foreign keys a table points OUT of, read from PostgREST's column
 * descriptions, which carry a marker like <fk table='listings' column='id'/>.
 *
 * These are not decoration. postgrest-js's `GenericTable` REQUIRES a
 * `Relationships` field, and a table without one fails the `GenericSchema`
 * constraint. When that happens the client does not complain — it silently
 * degrades EVERY `.select()` to `never`, so even `data[0].id` fails with
 * "Property 'id' does not exist on type 'never'" and the schema looks broken
 * when it was the types all along. (That is exactly what happened on the first
 * pass of this generator.)
 *
 * They are also what lets an embedded select like `car_colors ( name, hex )`
 * resolve to the joined row instead of an error.
 */
function relationships(table, props) {
  const out = [];
  const fk = /<fk table='([^']+)' column='([^']+)'\/>/;

  for (const [col, prop] of Object.entries(props)) {
    const m = fk.exec(prop.description ?? '');
    if (!m) continue;
    out.push({
      // PostgREST does not publish the constraint's name, so this is Postgres's
      // own default naming. It only matters for disambiguating two keys that
      // point at the same table in one embedded select.
      foreignKeyName: `${table}_${col}_fkey`,
      column: col,
      referencedRelation: m[1],
      referencedColumn: m[2],
    });
  }
  return out;
}

const res = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
});

if (!res.ok) {
  console.error(`Schema fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const spec = await res.json();
const defs = spec.definitions ?? {};

// ── Enums, collected from the columns that use them ──────────────────────────
const enums = new Map();
for (const def of Object.values(defs)) {
  for (const prop of Object.values(def.properties ?? {})) {
    const fmt = prop.format ?? '';
    if (fmt.startsWith('public.') && Array.isArray(prop.enum)) {
      enums.set(fmt.slice('public.'.length), prop.enum);
    }
  }
}
const enumNames = new Set(enums.keys());

/**
 * The database functions, from PostgREST's /rpc/* paths.
 *
 * Without these `Functions` is empty and every `.rpc('profile_complete')` is a
 * type error, because supabase-js checks the name against this map. The args
 * are fully described by the spec; the RETURN type is not, so it is `unknown`
 * and each call site says what it expects.
 */
const functions = [];
for (const [route, path] of Object.entries(spec.paths ?? {})) {
  if (!route.startsWith('/rpc/')) continue;
  const name = route.slice('/rpc/'.length);
  const body = (path.post?.parameters ?? []).find((prm) => prm.in === 'body');
  const props = body?.schema?.properties ?? {};
  const required = new Set(body?.schema?.required ?? []);
  const args = Object.keys(props)
    // Postgres allows unnamed arguments (show_trgm(text) is one), and PostgREST
    // reports them with an empty key. There is no way to pass such an argument
    // by name over PostgREST anyway, so it is dropped rather than emitted as a
    // nameless property that will not parse.
    .filter((arg) => arg.trim() !== '')
    .map((arg) => {
      const optional = required.has(arg) ? '' : '?';
      return `          ${arg}${optional}: ${tsType(props[arg], enumNames)};`;
    });
  functions.push({ name, args });
}
functions.sort((a, b) => a.name.localeCompare(b.name));

// ── Tables ───────────────────────────────────────────────────────────────────
const tableNames = Object.keys(defs).sort();
let relCount = 0;
const lines = [];

lines.push(`/**
 * DB2's schema, as TypeScript. GENERATED — do not edit by hand.
 *
 *   npm run gen:types
 *
 * Read from the live database via PostgREST's OpenAPI description, so this
 * describes the schema that EXISTS, not the one src/marketplace/db/schema.sql
 * says should exist. When those two disagree that is worth knowing about, and
 * typing over it silently would hide it.
 *
 * ${tableNames.length} tables, ${enums.size} enums.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {`);

for (const table of tableNames) {
  const def = defs[table];
  const props = def.properties ?? {};
  const required = new Set(def.required ?? []);
  const cols = Object.keys(props);

  // PostgREST lists a column in `required` when it is NOT NULL.
  const row = cols.map(
    (c) => `          ${c}: ${tsType(props[c], enumNames)}${required.has(c) ? '' : ' | null'};`,
  );

  const insert = cols.map((c) => {
    const notNull = required.has(c);
    // Mandatory only when the database will not fill it in for you: NOT NULL
    // and no default. Everything else is optional on insert.
    const optional = !notNull || props[c].default !== undefined;
    return `          ${c}${optional ? '?' : ''}: ${tsType(props[c], enumNames)}${notNull ? '' : ' | null'};`;
  });

  const update = cols.map(
    (c) => `          ${c}?: ${tsType(props[c], enumNames)}${required.has(c) ? '' : ' | null'};`,
  );

  const rels = relationships(table, props);
  relCount += rels.length;

  const relBody = rels
    .map(
      (r) =>
        `          {${NL}` +
        `            foreignKeyName: '${r.foreignKeyName}';${NL}` +
        `            columns: ['${r.column}'];${NL}` +
        `            isOneToOne: false;${NL}` +
        `            referencedRelation: '${r.referencedRelation}';${NL}` +
        `            referencedColumns: ['${r.referencedColumn}'];${NL}` +
        `          },`,
    )
    .join(NL);

  const relText = rels.length ? `${NL}${relBody}${NL}        ` : '';

  lines.push(`      ${table}: {
        Row: {
${row.join(NL)}
        };
        Insert: {
${insert.join(NL)}
        };
        Update: {
${update.join(NL)}
        };
        Relationships: [${relText}];
      };`);
}

lines.push(`    };
    Views: Record<string, never>;
    Functions: {`);

for (const fn of functions) {
  lines.push(`      ${fn.name}: {
        Args: ${fn.args.length ? `{
${fn.args.join(NL)}
        }` : 'Record<string, never>'};
        Returns: unknown;
      };`);
}

lines.push(`    };
    Enums: {`);

for (const [name, values] of [...enums].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`      ${name}: ${values.map((v) => `'${v}'`).join(' | ')};`);
}

lines.push(`    };
    CompositeTypes: Record<string, never>;
  };
}

/** Row types by table name: \`Row<'listings'>\`. */
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/** Insert payloads by table name: \`Insert<'listings'>\`. */
export type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/** Update payloads by table name: \`Update<'listings'>\`. */
export type Update<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/** Enum unions by name: \`Enum<'listing_state'>\`. */
export type Enum<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
`);

const out = path.join('src', 'marketplace', 'db', 'types.ts');
fs.writeFileSync(out, lines.join(NL), 'utf8');
console.log(
  `${out}: ${tableNames.length} tables, ${enums.size} enums, ${relCount} relationships, ${functions.length} functions`,
);
