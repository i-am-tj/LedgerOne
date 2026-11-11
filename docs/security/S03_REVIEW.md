# P1-S03 technical security review

Date: 2026-11-11 (Asia/Kolkata). Reviewed baseline: `9aaaed9`. Reviewer: implementing agent, manual code review plus automated evidence; not an independent external audit or peer-reviewed merge.

Result: **PASS for continued local development, with release prerequisites below**. No unresolved code defect blocking the current Google-only local auth flow was found. This result does not pass Phase 1 or approve public deployment.

Reviewed `src/lib/auth/{policy,create-auth,requests,server}.ts`, auth/session routes, private page/layout guards, login/client controls, identity migration, Next logging, and security tests. Checked current installed Next authentication guidance about independent page/action/API authorization. User-approved policy: exact verified Google allowlist; eight-hour absolute database sessions; local-only deployment pending approval. Live owner sign-in and independent anonymous rejection were previously observed and recorded in P1-S03.

| Review area   | Finding/evidence                                                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admission     | Google provider and verified exact allowlist checked before persistence and returning OAuth sign-in; no public passwords/signup/link/token APIs exposed                                                  |
| OAuth         | State/cookie binding, PKCE and Google token validation delegated to pinned library; test-local exchange substitutes only external Google traffic; live owner callback observed                           |
| Origin/input  | Strict same-origin JSON POSTs, cross-site rejection, bounded 2-KiB stream, fixed callback targets; no client token-sign-in shortcut                                                                      |
| Session       | Signed host-only HttpOnly/Lax cookies; Secure for HTTPS; opaque DB session, eight-hour absolute expiry; cookie cache/refresh disabled; revocation/policy rechecked server-side                           |
| Entry points  | Every current private page plus dynamic layout guarded; session API independently guarded; no static cached private rendering; no auth test bypass shipped                                               |
| Secrets/DTO   | Provider credentials encrypted by library, secret stays local/server-only; raw session/token APIs blocked; minimal private/no-store DTO; auth URL/argument logging suppressed                            |
| Failure/abuse | Missing config, DB failure, invalid cookies fail closed; DB rate bucket cannot be changed through client IP headers; generic callback/client errors                                                      |
| Regression    | This review reran 38 unit and 8 isolated PostgreSQL integration tests: PASS. Runtime `npm audit --omit=dev`: zero findings. Prior full browser suite: 32 PASS; live user-assisted Google flow documented |

## Release prerequisites and limits

- P1-S04 must provide resource ownership, atomic audit and sanitized tracing before private financial APIs exist. Authenticated does not mean allowed to access every user's data.
- Financial invariants, actual account/transaction IDOR tests and all remaining Phase 1 gates are still unimplemented.
- Production HTTPS/canonical callback, least-privilege DB role separate from migration ownership, encrypted backup/key custody/restore and trusted deployment configuration must be reviewed before deployment. No deployment is authorized here.
- Ten known moderate development-tool audit findings remain tracked; no forced transitive major override was applied. No runtime finding was reported in this review.
- Auth expiry denial exists; retention/purge policy and sanitized security/audit event coverage need the operational/privacy stories. Library raw session tokens remain sensitive DB data, even though cookie signatures and blocked token endpoints protect their browser use.
- Live logout and non-allowlisted Google login were not performed in the user's session; automated integration/browser negatives cover those controls. Strict concurrent rate-limit guarantees and an independent penetration test are not claimed.

No code change was necessary for this review. Future private endpoints must use the verified server identity and owner-scoped predicates; never accept an owner ID from a client as authority. User's instruction to continue authorizes the next local increment. This records the technical review the agent owns, without asking the user to audit OAuth code or inventing an independent review/merge.
