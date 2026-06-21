// Lines for 02-admin-guide.pdf — the content block for
// the customer-support RAG fixture "Pulsar Analytics - Admin Guide".
// Re-render with `renderPdf` from this package; this file is
// pure data, no pdf-lib import.
export const lines: readonly string[] = [

    'Pulsar Analytics - Workspace Admin Guide',
    'Effective from May 2026',
    '',
    '1. Workspace settings',
    'Workspace > Settings is where admins change the workspace',
    'name, logo, default timezone, and billing contact. Changes',
    'propagate to all members within a minute.',
    '',
    '2. Roles and permissions',
    'Pulsar has three roles: Viewer (read-only dashboards),',
    'Editor (create and edit dashboards, cannot manage members)',
    'and Admin (full workspace control, including billing). Custom',
    'roles with granular permissions are available on the Enterprise',
    'plan only.',
    '',
    '3. Audit log',
    'Workspace > Audit log records every admin and editor action:',
    'member invites, role changes, dashboard publications, data',
    'source additions, and query exports. Entries are retained for',
    '90 days on Starter/Team and 365 days on Business/Enterprise.',
    '',
    '4. Data sources',
    'Workspace > Data sources lets admins connect, test, and remove',
    'data warehouse connections. Pulsar stores credentials encrypted',
    'at rest with envelope encryption; admins can rotate the workspace',
    'master key from the same page.',
    '',
    '5. Account recovery',
    'Admins can transfer workspace ownership to another member from',
    'Workspace > Settings > Ownership. The new owner must accept the',
    'transfer within 7 days, after which the original owner loses admin',
    'privileges.',
  
];
