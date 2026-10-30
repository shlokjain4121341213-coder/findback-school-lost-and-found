# FindBack — School Lost & Found

A dark, mobile-friendly lost and found board branded for Delhi Public School Indirapuram. It uses Supabase for sign-in, the shared database, and private photo storage. School members sign in before they can see listings or images.

The school crest and Society logo load from the [DPS Society’s official school directory](https://dpsfamily.org/assets/img/dps-schools/DPS-indirapuram.jpg) and [official Society logo directory](https://dpsfamily.org/assets/img/logo/logo2.png), so an internet connection is needed to display them.

## What the site does

- Lets students sign in with a school ID and password. The school head creates up to 10 pilot accounts; public self-sign-up is disabled.
- Lets signed-in users change their password from **Settings**.
- Lets each user choose a dark or light appearance and a teal, orange, blue, or violet accent.
- Credits the build lead, Shlok Jain, in the site information and footer.
- Lets members report found or lost items, search/filter the board, and attach a small photo.
- Lets a member privately claim a found item.
- Lets an invigilator write one or more private ownership questions. The claimant answers from **My claims**; invigilators can then approve or reject the claim.
- Lets a staff member mark an approved item as returned.
- Lets the school head grant or remove invigilator access. Head access is assigned by the project owner in Supabase.
- Applies database row-level security (RLS) and keeps item photos in a private bucket.

## Files

- `index.html` — page layout and forms
- `styles.css` — dark navy and teal theme
- `app.js` — sign-in, reports, claims, verification questions, and team actions
- `config.js` — the Supabase project URL and public publishable key
- `database.sql` — database tables, role rules, triggers, and private photo policies
- `supabase/migrations/20261030_student_id_accounts.sql` — locks new account creation to the school-head provisioning flow
- `supabase/functions/create-student-account/` — secure account creation endpoint; its admin key stays on Supabase

## Set it up

### 1. Create the free cloud project

1. Create a Supabase account and a new project.
2. Choose the **Free** plan. Save the database password somewhere safe; you do not need to put it into this website.
3. In the project dashboard, open **SQL Editor**, create a query, paste all of `database.sql`, and run it.
4. In **Project Settings → API Keys** (or the project’s API settings page), copy the **Project URL** and **publishable key**.
5. Open `config.js`. Replace the two `PASTE_...` values with the URL and publishable key. Do not put a secret key or `service_role` key in this file.

Supabase’s current Free plan includes 500 MB database space and 1 GB file storage, and free projects can pause after a week of inactivity. Keep photos small and remove old items from the dashboard if the school’s retention policy allows it. Check the [current Supabase pricing and limits](https://supabase.com/pricing) before a school-wide rollout because plan limits can change.

### 2. Preview it on your computer

1. Install Visual Studio Code if you do not already have it.
2. In VS Code, open the `lost-and-found-school` folder.
3. Install the **Live Server** extension, then right-click `index.html` and choose **Open with Live Server**. A browser page should open at a local address such as `http://127.0.0.1:5500`.
4. In Supabase, open **Authentication → URL Configuration**. While testing locally, set the Site URL to the local address Live Server shows, and add these Redirect URLs:
   - `http://127.0.0.1:5500/**`
   - `http://localhost:5500/**`
5. Sign in using the school-head account described below. Student accounts are created from **Manage accounts** after the head is signed in.

### 3. Set up the school head and student accounts

1. For a brand-new project, create the school head's first email/password account in Supabase **Authentication → Users → Add user** and confirm that admin email. Existing projects can keep their current head account.
2. In Supabase **SQL Editor**, replace the sample address below with that existing head account's email and run:

   ```sql
   update public.profiles
   set role = 'head'
   where lower(email) = lower('head@your-school.edu');
   ```

3. Apply `supabase/migrations/20261030_student_id_accounts.sql` in SQL Editor.
4. Install the [Supabase CLI](https://supabase.com/docs/guides/cli). From a terminal opened in this project folder, link the Supabase project and deploy the protected account-creation function:

   ```text
   supabase login
   supabase link --project-ref fqogphospzjigagwzugq
   supabase functions deploy create-student-account
   ```

   The function uses Supabase's server-side secret setting. Never copy that secret into `config.js`, `app.js`, or another browser file.
5. In Supabase Authentication settings, turn off **Allow new users to sign up**. New accounts are created only by the school head through **Manage accounts**.
6. Sign in with the head account. In **Manage accounts**, paste up to 10 school IDs at once, enter a shared pilot password, and create the accounts. Each profile is labeled with its school ID. Students sign in with the ID and password, then change the shared starting password in **Settings**. The head can also grant or remove invigilator access.

Do not let users choose their own role. The head-created pilot accounts start as regular members.

### 4. Try the whole item-return flow

Use two test accounts: one member and one invigilator. The invigilator account must first be created and upgraded by the head.

1. The invigilator signs in and reports a **found** item. Add a general description and leave a distinguishing mark or detail out of the listing.
2. The member signs in, finds that item, chooses **Claim item**, and sends an initial private note.
3. The invigilator opens **Invigilator review**, selects **Ask ownership questions**, and writes a question about a detail the listing does not reveal. The prompt is private to the claimant and staff.
4. The member opens **My claims**, answers the questions, and sends the reply.
5. The invigilator reviews the answer and approves or rejects the claim. Approval changes the listing to **Claim approved**. After handing over the item, staff choose **Mark returned**.

An invigilator can also approve a claim from its initial note when the answer already makes ownership clear. For a physical handover, school staff should follow the school’s normal lost-property process.

## Publish it for your school

The easiest free option for these static files is GitHub Pages. GitHub Free provides Pages for public repositories, and a published Pages site is publicly reachable even though the app requires sign-in to view its board. The website code and `config.js` will be visible to anyone; that is expected for a browser app. The publishable key is intended for the browser, and the database’s RLS rules protect data. Never add a secret/service-role key.

1. Create a GitHub account if needed, then create a **public** repository such as `school-lost-found`.
2. Upload all the files in this folder to the repository’s top level. Make sure `index.html` is at the top level.
3. In the repository, open **Settings → Pages**. Under the publishing source, choose the `main` branch and `/ (root)`, then save.
4. Wait for GitHub Pages to publish. Open the URL it shows; it will look like `https://YOUR-ACCOUNT.github.io/school-lost-found/`.
5. In Supabase **Authentication → URL Configuration**, set the Site URL to that published address and add that exact address to Redirect URLs. Keep the local redirect addresses too if you still use Live Server.
6. Share the site URL with your school community. The listing page and photos still require a signed-in account. For real use, only share it with the school, use school-issued accounts, and get school approval before entering student or staff information.

See GitHub’s [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) and [publishing-source guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) for the current screens.

## Keep ownership checks useful and safe

- Ask about private identifying details such as an unlisted mark, a detail inside a bag, or a feature not shown in the photo.
- Do not put the answer to an ownership question in the public listing.
- Do not request passwords, student ID numbers, addresses, or unrelated personal information.
- Avoid photos of people, ID cards, or screens with private details.
- Public self-sign-up is disabled for the pilot. The school head creates student accounts in **Manage accounts**, up to the 10-account limit. Share the site only with the school community and get school approval before entering student or staff information.

## Free plan notes

This is a working starter using free tiers, not a promise of unlimited hosting or permanent backups. Supabase currently lists 1 GB file storage, 500 MB database space, and pausing after a week of inactivity on its Free plan. GitHub Pages on GitHub Free requires a public repository. Limits and terms can change; check the providers’ current docs before rollout. The visual fonts load from Google Fonts, so the site uses system fonts if the network blocks them.
