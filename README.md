# Baby Registry

A GiftList-style cash baby registry. All items are already purchased — guests
chip in toward part or all of an item via **Venmo** or **Zelle**, then confirm
the payment went through so the progress bars update.

## How it works

**Guests**
1. Browse items, click **Contribute** (partial) or **Pay for item** (the remaining balance).
2. Enter name, amount, optional note, and pick Venmo or Zelle.
   - Venmo opens a deep link with the amount and note pre-filled.
   - Zelle shows the recipient email/phone with a copy button (Zelle payments are sent from the guest's own banking app).
3. Back in the registry, they confirm "Yes, I sent it" — only then does the
   contribution count toward the progress bar. If they leave without answering,
   they're asked again on their next visit ("Welcome back — did the payment go
   through?"). Answering "No" removes the pending contribution.

**Parents** — click *For parents* in the footer and enter the PIN.
- **Add item**: paste any product link (Amazon, Target, ...) — the store is
  auto-detected; add title, price you paid, and optionally an image URL and note.
- **Settings**: registry title, welcome message, Venmo username, Zelle
  email/phone + recipient name, and the PIN itself.
- Per item: edit, view gifts (confirm or remove any contribution), mark
  received, delete.

## Stack

Static site (no build step) + Supabase (`registry_settings`, `registry_items`,
`registry_contributions` tables in project `bzmvlraziqevqdyotvgy`).
Serve locally with:

```sh
python3 -m http.server 8788 --directory .
```

Note: the tables use open RLS policies and the parent PIN is checked
client-side — fine for a family registry with no sensitive data, but don't
reuse this pattern for anything that needs real auth.
