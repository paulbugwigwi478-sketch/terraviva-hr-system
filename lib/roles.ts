export type Role = 'hr_admin' | 'director' | 'employee' | 'auditor'

export const ROLES: Role[] = ['hr_admin', 'director', 'employee', 'auditor']

export const ROLE_LABELS: Record<Role, string> = {
  hr_admin: 'HR Admin',
  director: 'Director / Chairman',
  employee: 'Employee',
  auditor: 'Auditor',
}

/** Roles that can see the whole organisation (the database enforces this too). */
export const ORG_VIEWERS: Role[] = ['hr_admin', 'director', 'auditor']
export const HR: Role[] = ['hr_admin']

export function can(role: string | null | undefined, allowed: Role[]): boolean {
  return !!role && (allowed as string[]).includes(role)
}
