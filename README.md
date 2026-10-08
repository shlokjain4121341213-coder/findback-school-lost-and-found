# FindBack — School Lost & Found

A dark, mobile-friendly lost and found board for school communities. It uses Supabase for sign-in, the shared database, and private photo storage. Members sign in before they can see listings or images.

The custom FindBack logo is included in `assets/findback-logo.png`.

## What the site does

- Lets a student or staff member create an account, sign in, and sign out.
- Lets members report found or lost items, search/filter the board, and attach a small photo.
- Lets a member privately claim a found item.
- Lets an invigilator write one or more private ownership questions. The claimant answers from **My claims**; invigilators can then approve or reject the claim.
- Lets a staff member mark an approved item as returned.
- Lets a head account grant or remove invigilator access. Heads are assigned by the project owner in Supabase and cannot be created from the public sign-up form.
- Applies database row-level security (RLS) and keeps item photos in a private bucket.

## Files

- `index.html` — page layout and forms
- `styles.css` — dark navy and teal theme
- `app.js` — sign-in, reports, claims, verification questions, and team actions
- `config.js` — the Supabase project URL and public publishable key
- `database.sql` — database tables, role rules, triggers, and private photo policies

## Set it up

### 1. Create the free cloud project

1. Create a Supabase account and a new project.
2. Choose the **Free** plan. Save the database password somewhere safe; you do not need to put it into this website.
3. In the project dashboard, open **SQL Editor**, create a query, paste all of `database.sql`, and run it.
4. Before sharing the site, optionally restrict registration to school-issued email domains by running this in SQL Editor (replace the sample domains):

   ```sql
   update public.school_settings
   set allowed_email_domains = array['your-school.edu', 'students.your-school.edu']
   where singleton = true;
   ```

   Add the part after `@` for each allowed email domain, in lowercase. If the list is empty, any email address can create a regular member account.
5. In **Project Settings → API Keys** (or the project’s API settings page), copy the **Project URL** and **publishable key**.
6. Open `config.js`. Replace the two `PASTE_...` values with the URL and publishable key. Do not put a secret key or `service_role` key in this file.

Supabase’s current Free plan includes 500 MB database space and 1 GB file storage, and free projects can pause after a week of inactivity. Keep photos small and remove old items from the dashboard if the school’s retention policy allows it. Check the [current Supabase pricing and limits](https://supabase.com/pricing) before a school-wide rollout because plan limits can change.

### 2. Preview it on your computer

1. Install Visual Studio Code if you do not already have it.
2. In VS Code, open the `lost-and-found-school` folder.
3. Install the **Live Server** extension, then right-click `index.html` and choose **Open with Live Server**. A browser page should open at a local address such as `http://127.0.0.1:5500`.
4. In Supabase, open **Authentication → URL Configuration**. While testing locally, set the Site URL to the local address Live Server shows, and add these Redirect URLs:
   - `http://127.0.0.1:5500/**`
   - `http://localhost:5500/**`
5. Create a test account on the website. If email confirmation is enabled, open the confirmation email before signing in. Supabase’s built-in email service is best-effort and currently limited to 2 messages per hour, so test sign-up emails with a small group first. For a school rollout, use a school-approved email sender if more confirmation emails are needed. See [Supabase email sending limits](https://supabase.com/docs/guides/auth/passwords#email-sending).

### 3. Assign the first school head

1. Create the head’s account from the site’s **Create account** form and confirm the email if prompted.
2. In Supabase **SQL Editor**, replace the sample address below with that account’s email and run:

   ```sql
   update public.profiles
   set role = 'head'
   where lower(email) = lower('head@your-school.edu');
   ```

3. Sign out and back in. The head will see **Manage team**.
4. Ask each invigilator to create an account. The head can then grant or remove invigilator access from **Manage team**. New accounts always start as regular members.

To add another head later, the project owner can run the same SQL with that person’s email. Do not let users choose their own role.

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
- New accounts can self-register in this starter and begin as members. If the email-domain list is empty, anyone with the public website URL can register; add the school’s approved domains in `school_settings` before sharing the site if the school uses them. Share the link only with the school community and get school approval before entering student or staff information.

## Free plan notes

This is a working starter using free tiers, not a promise of unlimited hosting or permanent backups. Supabase currently lists 1 GB file storage, 500 MB database space, and pausing after a week of inactivity on its Free plan. GitHub Pages on GitHub Free requires a public repository. Limits and terms can change; check the providers’ current docs before rollout. The visual fonts load from Google Fonts, so the site uses system fonts if the network blocks them.
