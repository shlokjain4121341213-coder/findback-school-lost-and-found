# FindBack - Future Student Account Changes

**Status:** Proposed future work. Do not deploy these changes until the teacher has tested and approved the website and the school has approved the account policy.

## Goal

Make FindBack usable by the full school community, with student email ownership checks, safe password recovery and changes, and staff-managed access. The student account features must protect each person's account and records.

## Required student account features

1. **School-approved enrollment**
   - Create accounts only for people approved by the school.
   - Use the official student roster or another school-approved list.
   - Verify the school email before granting access.
   - Turn off open public sign-ups after the approved enrollment method is ready.
   - A domain rule can block non-school email domains, but a domain rule alone does not prove someone is on the school's approved roster.

2. **Verified sign-in**
   - Require the student to prove control of their school email at every login, as requested.
   - Choose and approve the implementation before coding. Email-code or magic-link sign-in verifies the inbox at each login but is passwordless; a password-plus-email-code flow needs a secure, server-enforced second factor:
     - Email one-time code or magic-link login verifies the email inbox at each sign-in and is Supabase's native email-based login method; or
     - Password plus an emailed second-step code requires a secure server-backed MFA design. Supabase's currently documented native MFA second factors are authenticator-app TOTP and phone codes; email OTP is a passwordless sign-in method. Do not implement a fake second step only in browser JavaScript.
   - Keep the application board and database access blocked until the required verification is complete.

3. **Forgot password**
   - Put a **Forgot password?** link on the sign-in screen.
   - Send a single-use recovery link to the verified account email using Supabase Auth.
   - The link returns only to the approved website URL and opens a reset screen.
   - Let the student choose and confirm a new password. Show the same neutral confirmation regardless of whether an email is registered, so the page does not reveal which accounts exist.
   - Expired, reused, or invalid links must not change the password.

4. **Change password while signed in**
   - Add a **Change password** section under account settings.
   - Require the current password or a fresh email reauthentication step, depending on the approved Supabase security setting.
   - Validate and confirm the new password, then update it through Supabase Auth.
   - Confirm success and ensure the old password no longer works.

5. **Manage email and profile**
   - Let students update their display name.
   - If school policy permits email changes, require confirmation of the new email before switching the account to it.
   - Collect only profile information the school has approved as necessary.

6. **Session and recovery support**
   - Keep clear sign-out behavior and handle expired sessions without exposing another user's data.
   - Provide safe resend/retry behavior for verification, invitation, and recovery messages.
   - Give students a school-approved support contact for lost email access or expired invitations; staff must verify identity before changing access.

7. **Staff account management**
   - Let the authorized school head or administrator invite, disable, and remove accounts, and assign approved staff roles.
   - Students cannot change their own role or manage another person's account.
   - Remove access when a student or staff member is no longer eligible.

## School-wide email delivery

Before a full-school rollout, configure a school-approved SMTP/email provider for invitation, verification, and password recovery messages. Supabase's built-in sender is intended for testing and has strict delivery limits. For larger rosters, use a secure server-side invitation process with batching and retries. Never put the Supabase secret/service-role key in `config.js`, `app.js`, or any browser-visible file.

## Planned project files and settings

| File or service | Planned work |
| --- | --- |
| `index.html` | Add verified sign-in, invitation activation, forgot/reset password, change password, profile/account settings, and any approved verification challenge screens. Remove public self-sign-up when roster-based invitations are enabled. |
| `app.js` | Connect the account screens to Supabase Auth. Handle verification and recovery callbacks, email OTP or approved MFA, password reset/change, profile/email updates, and clear loading/error states. |
| `styles.css` | Style all account screens for mobile and desktop, including accessible labels, validation messages, and expired-link states. |
| `database.sql` | Preserve row-level security. Add approved-roster or profile policies only as needed; prevent one student from reading or editing another student's profile or claims, and keep staff actions staff-only. |
| `config.js` | Keep only the public project URL and publishable key. No secret/service-role key. |
| `README.md` | Explain account enrollment, Auth dashboard settings, email setup, student password recovery, role assignment, and school support procedures. |
| Supabase Auth dashboard | Configure email confirmation, URL redirects, email templates, password/security settings, MFA or email-login method, and school-approved SMTP. Disable public sign-ups after the approved invitation flow is ready. |
| New server-side function, if needed | Handle bulk roster invitations or an approved custom second-factor flow. Keep all admin secrets in server-side settings and check admin authorization on every request. |

## Approval and launch sequence

1. Teacher tests the current website with demo accounts and made-up item data.
2. Fix issues and get the teacher's approval for the site's purpose and school use.
3. Get school approval for the eligible roster, email policy, account recovery process, staff roles, and privacy rules.
4. Implement the account screens, secure authentication, email delivery, and database policies described above.
5. Run the account acceptance checklist below with student, invigilator, and head roles.
6. Send invitations to the approved roster in planned batches and share student instructions.
7. Set up ongoing account support and remove access when accounts are no longer eligible.

Until the school approves the account setup, use demo accounts and made-up item data only.

## Acceptance checklist for the future implementation

- An unapproved or unverified account cannot enter the board.
- Every sign-in follows the school-approved email verification method.
- Recovery email goes only to the account's verified school email; expired or reused links fail safely.
- Password changes require the approved reauthentication step and replace the old password.
- Email changes require confirmation of the new address.
- One student cannot access another student's profile, private claim, or answers.
- Students cannot grant themselves staff access; staff-only tools reject member accounts.
- Authorized administrators can invite and remove users without exposing a secret key in the browser.
- Email delivery, invite retries, and account help work for the expected school-wide volume.

## Official references

- [Supabase password-based Auth and password reset](https://supabase.com/docs/guides/auth/passwords)
- [Supabase secure password changes](https://supabase.com/docs/guides/auth/password-security)
- [Supabase Auth MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase user invitations](https://supabase.com/docs/guides/auth/users)
