// Internal catalog mechanics; applications must import the server-only invariants entry.
import type { Pool, PoolClient } from "pg";
import { SCHEMA_VERSION } from "../schema-version";

export type InvariantManifest = Readonly<{
  version: string;
  objects: Readonly<Record<string, string>>;
}>;
export type InvariantScope = Readonly<{
  schema: string;
  // Map provisioned role names to reviewed logical identities, never passwords.
  roles?: Readonly<Record<string, string>>;
}>;
export class InvariantDriftError extends Error {
  constructor(public readonly differences: readonly string[]) {
    super("Ledger invariant attestation failed");
  }
}
function identifier(value: string) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value))
    throw new Error("Invalid invariant scope identifier");
  return `"${value}"`;
}
// Catalog only: no journal amounts, user data, session tokens or connection URLs.
// Caller supplies a consistent snapshot, or intentionally probes its own DDL TX.
export async function captureLedgerInvariants(
  client: Pick<PoolClient, "query">,
  scope: InvariantScope,
): Promise<InvariantManifest> {
  const schema = identifier(scope.schema);
  for (const [role, logical] of Object.entries(scope.roles ?? {})) {
    identifier(role);
    if (!/^[A-Z_]+$/.test(logical)) throw new Error("Invalid logical role");
  }
  const records: { key: string; value: unknown }[] = [];
  async function collect(sql: string, values: unknown[] = [scope.schema]) {
    const result = await client.query<{ key: string; value: unknown }>(
      sql,
      values,
    );
    records.push(...result.rows);
  }
  await collect(`SELECT 'schema' AS key, jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',
    (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(coalesce(nspacl,acldefault('n',nspowner))) a)) AS value
    FROM pg_namespace WHERE nspname=$1`);
  if (records.length !== 1) throw new InvariantDriftError(["schema:missing"]);
  await collect(`SELECT 'constraint:'||r.relname||':'||c.conname AS key,
    jsonb_build_object('definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) AS value
    FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname=$1`);
  await collect(`SELECT 'trigger:'||r.relname||':'||t.tgname AS key,
    jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled::text) AS value
    FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname=$1 AND NOT t.tgisinternal`);
  await collect(`SELECT 'function:'||p.proname||':'||pg_get_function_identity_arguments(p.oid) AS key,
    jsonb_build_object('definition',pg_get_functiondef(p.oid),'definer',p.prosecdef,'config',p.proconfig,
    'owner',pg_get_userbyid(p.proowner),'acl',(SELECT array_agg(a::text ORDER BY a::text) FROM unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a)) AS value
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.prokind IN ('f','p')`);
  await collect(`SELECT 'relation:'||r.relname AS key,
    jsonb_build_object('kind',r.relkind::text,'owner',pg_get_userbyid(r.relowner),'rls',r.relrowsecurity,'forceRls',r.relforcerowsecurity,
    'acl',(SELECT array_agg(a::text ORDER BY a::text) FROM unnest(coalesce(r.relacl,acldefault(CASE WHEN r.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,r.relowner))) a)) AS value
    FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname=$1 AND r.relkind IN ('r','p','v','m','S')`);
  await collect(`SELECT 'column:'||r.relname||':'||a.attname AS key,
    jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity::text,
    'generated',a.attgenerated::text,'default',pg_get_expr(d.adbin,d.adrelid),'acl',
    (SELECT array_agg(v::text ORDER BY v::text) FROM unnest(a.attacl) v)) AS value
    FROM pg_attribute a JOIN pg_class r ON r.oid=a.attrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname=$1 AND a.attnum>0 AND NOT a.attisdropped AND r.relkind IN ('r','p','v','m')`);
  await collect(`SELECT 'index:'||r.relname AS key, jsonb_build_object('definition',pg_get_indexdef(r.oid),'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive) AS value
    FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_index i ON i.indexrelid=r.oid WHERE n.nspname=$1 AND r.relkind='i'`);
  await collect(`SELECT 'enum:'||t.typname AS key, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS value
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname=$1 GROUP BY t.typname`);
  await collect(
    `SELECT 'defaultAcl:'||pg_get_userbyid(d.defaclrole)||':'||d.defaclobjtype::text||':'||coalesce(n.nspname,'global') AS key,
    (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(d.defaclacl) a) AS value
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
    WHERE n.nspname=$1 OR (d.defaclnamespace=0 AND pg_get_userbyid(d.defaclrole)=ANY($2::text[]))`,
    [scope.schema, Object.keys(scope.roles ?? {})],
  );
  await collect(
    `SELECT 'role:'||rolname AS key, jsonb_build_object('super',rolsuper,'createRole',rolcreaterole,
    'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls,'inherit',rolinherit,
    'memberships',(SELECT array_agg(pg_get_userbyid(m.roleid) ORDER BY pg_get_userbyid(m.roleid)) FROM pg_auth_members m WHERE m.member=r.oid)) AS value
    FROM pg_roles r WHERE rolname=ANY($1::text[])`,
    [Object.keys(scope.roles ?? {})],
  );
  if (
    records.filter((r) => r.key.startsWith("role:")).length !==
    Object.keys(scope.roles ?? {}).length
  )
    throw new InvariantDriftError(["role:missing"]);
  // Include privilege paths into and out of the configured roles, including
  // indirect grantees. Role names alone omit delegation/SET/INHERIT changes.
  await collect(
    `WITH RECURSIVE ancestors(oid) AS (
      SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[])
      UNION SELECT m.roleid FROM pg_auth_members m JOIN ancestors a ON m.member=a.oid
    ), grantees(oid) AS (
      SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[])
      UNION SELECT m.member FROM pg_auth_members m JOIN grantees g ON m.roleid=g.oid
    ) SELECT 'membership:'||m.roleid||':'||m.member||':'||m.grantor AS key,
      jsonb_build_object('role',pg_get_userbyid(m.roleid),'member',pg_get_userbyid(m.member),
      'grantor',pg_get_userbyid(m.grantor),'admin',m.admin_option,
      'inherit',m.inherit_option,'set',m.set_option) AS value
      FROM pg_auth_members m WHERE m.member IN (SELECT oid FROM ancestors)
      OR m.roleid IN (SELECT oid FROM grantees)`,
    [Object.keys(scope.roles ?? {})],
  );
  await collect(
    `SELECT 'migration:'||migration_name AS key,
    jsonb_build_object('checksum',checksum,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL,'steps',applied_steps_count) AS value
    FROM ${schema}."_prisma_migrations"`,
    [],
  );
  const version = await client.query<{ value: string }>(
    `SELECT value FROM ${schema}.app_metadata WHERE key='schema_version'`,
  );
  if (version.rows[0]?.value !== SCHEMA_VERSION)
    throw new InvariantDriftError(["version:unsupported"]);
  // Compare the same schema/profile. Never rewrite SQL source/literals: doing
  // so could make a changed function body compare equal after normalization.
  const roleName = (name: string) =>
    Object.hasOwn(scope.roles ?? {}, name)
      ? `$ROLE_${scope.roles![name]}`
      : name;
  function normalizeMetadata(value: unknown, field = ""): unknown {
    if (typeof value === "string") {
      if (["owner", "memberships", "role", "member", "grantor"].includes(field))
        return roleName(value);
      if (field === "acl") {
        const acl =
          /^([a-z_][a-z0-9_]*|)=([A-Za-z*]+)\/([a-z_][a-z0-9_]*)$/.exec(value);
        if (acl) return `${roleName(acl[1]!)}=${acl[2]}/${roleName(acl[3]!)}`;
      }
      return value;
    }
    if (Array.isArray(value)) {
      const values = value.map((v) => normalizeMetadata(v, field));
      return field === "acl" || field === "memberships"
        ? values.sort()
        : values;
    }
    if (value !== null && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b, "en"))
          .map(([key, v]) => [key, normalizeMetadata(v, key)]),
      );
    return value;
  }
  const objects: Record<string, string> = {};
  for (const record of records) {
    let key = record.key;
    const normalized = normalizeMetadata(
      record.value,
      key.startsWith("defaultAcl:") ? "acl" : "",
    );
    if (key.startsWith("membership:")) {
      const edge = normalized as Record<string, unknown>;
      key = `membership:${JSON.stringify([edge.role, edge.member, edge.grantor])}`;
    }
    for (const role of Object.keys(scope.roles ?? {})) {
      if (key === `role:${role}`) key = `role:${roleName(role)}`;
      if (key.startsWith(`defaultAcl:${role}:`))
        key = `defaultAcl:${roleName(role)}:${key.slice(`defaultAcl:${role}:`.length)}`;
    }
    if (Object.hasOwn(objects, key))
      throw new InvariantDriftError(["catalog:duplicate"]);
    objects[key] = JSON.stringify(normalized);
  }
  return {
    version: SCHEMA_VERSION,
    objects: Object.fromEntries(
      Object.entries(objects).sort(([a], [b]) => a.localeCompare(b, "en")),
    ),
  };
}
export function assertLedgerInvariants(
  actual: InvariantManifest,
  expected: InvariantManifest,
) {
  const differences: string[] = [];
  if (actual.version !== SCHEMA_VERSION || expected.version !== SCHEMA_VERSION)
    differences.push("version:unsupported");
  if (
    !Object.keys(actual.objects).length ||
    !Object.keys(expected.objects).length
  )
    differences.push("catalog:empty");
  for (const key of new Set([
    ...Object.keys(actual.objects),
    ...Object.keys(expected.objects),
  ]))
    if (actual.objects[key] !== expected.objects[key]) differences.push(key);
  if (differences.length) throw new InvariantDriftError(differences.sort());
}
// S06B-R03: a caller's promise deadline must not leave a blocked read snapshot.
export async function readLedgerInvariants(
  pool: Pool,
  scope: InvariantScope,
  timeoutMs = 2500,
) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
    throw new Error("Invalid invariant read timeout");
  const client = await pool.connect();
  let destroy = false;
  const onError = () => {
    destroy = true;
  };
  client.on("error", onError);
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query(
      "SELECT set_config('statement_timeout',$1,true),set_config('transaction_timeout',$2,true)",
      [String(Math.min(2000, timeoutMs)), String(timeoutMs)],
    );
    await client.query(
      `SET LOCAL search_path = pg_catalog, ${identifier(scope.schema)}, pg_temp`,
    );
    const manifest = await captureLedgerInvariants(client, scope);
    await client.query("COMMIT");
    return manifest;
  } catch (error) {
    const details = error as { code?: unknown; severity?: unknown } | null;
    const databaseError =
      typeof details?.code === "string" && /^[0-9A-Z]{5}$/.test(details.code);
    destroy ||=
      details?.severity === "FATAL" ||
      (!databaseError && !(error instanceof InvariantDriftError));
    if (!destroy) {
      try {
        await client.query("ROLLBACK");
      } catch {
        destroy = true;
      }
    }
    throw error;
  } finally {
    client.release(destroy);
    client.removeListener("error", onError);
  }
}
