# Terraviva HR System

Next.js + Supabase + Vercel. Employee records, departments and positions, contracts, private documents, leave (requests, approvals, balances), audit log.

## Setup
1. Push this folder to the GitHub repo `terraviva-hr-system`; import the repo in Vercel.
2. The Supabase URL and publishable key are already set in `lib/config.ts` (they are public values). To override, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel.
3. Supabase -> Authentication:
   - Sign In / Providers -> Email: **Allow new users to sign up = ON**, **Confirm email = ON**.
   - URL Configuration: Site URL = your Vercel URL; add `<your Vercel URL>/auth/callback` and `<your Vercel URL>/**` to Redirect URLs.
4. First login: sign up at `/signup` with the invited email (`paulbugwigwi@gmail.com`), confirm it, sign in. You become **HR Admin**.

## Roles
HR Admin, Director, Employee, Auditor. A manager is simply an employee who is set as someone's manager; they see and approve their own team's leave.
Salary, tax/bank details and documents are visible only to HR Admin and Director (and an employee sees their own details). Auditors cannot see salaries or documents.

## Leave rules (enforced in the database)
- Weekends and public holidays are not counted. A request cannot span two calendar years.
- Balance, overlap and gender-specific leave types (maternity/paternity) are checked.
- Nobody can approve their own request. One-step approval by the employee's manager, or HR Admin / Director.
- Defaults seeded (edit under "Leave types"; verify against Terraviva's HR policy): Annual 28, Sick 63, Maternity 84, Paternity 3, Compassionate 4, Unpaid unlimited.
- Public holidays for 2026 are seeded (fixed dates only). Add moveable holidays (Eid etc.) and future years under "Holidays".

## Not built yet
Payroll, attendance, performance reviews, recruitment, training, Swahili interface, email notifications.
