# Roadmap

## Done
- [x] Home, Contact Center, customer inbox, dashboard summary cards
- [x] Production audit (Sep 21): code check, production build, data-access rules,
      cross-account isolation, POS → kitchen → stock, payments/SMS state, install/deploy config
- [x] Security fix: internal database actions (stock change, order stock use, reward award,
      review request, notification scheduling, owner claim) no longer callable with the public app key

## Waiting on configuration (not code)
- [ ] SMS sending: Alpha SMS API key + auth SMS hook secret
- [ ] Scheduled notification sender still points at the preview address; repoint after publishing
- [ ] Owner phone, Messenger link, WhatsApp number for the extra Contact options
- [ ] Online payment providers (bKash, Nagad, Card) are placeholders; cash is the live method
- [ ] No installable-app (manifest) file, so phone install + notification sound is limited
- [ ] Owner Finance & profit partners: run `docs/sql/owner_finance_partners.sql` once in Supabase
- [x] Review database update applied (general reviews, photo only) — verified Sep 21


## Future (separate phases, not started)
- [ ] Multi-restaurant / multi-tenant SaaS architecture with master admin

- [x] Owner Orders and Kitchen presentation improved for faster processing without changing order logic, permissions, or data structure
- [x] Owner order cards open one dedicated details page; item photos use stored snapshots with existing menu-image fallback
## Done
- [x] Unified staff creation, secure legacy invite claiming, email/phone authentication, staff routing, and password change

## Done
- [x] Reorganize Owner/Staff into the shared Home, Messages, Orders, Account workspace while preserving customer navigation and existing permissions

- [x] Customer CRM Phase 1: customer profile page, search/sort, internal notes and tags, CRM identity records, phone-reveal audit (run docs/sql/customer_crm_phase1.sql once)
- [ ] Customer CRM Phase 1: run `docs/sql/customer_crm_phase1.sql` once in Supabase

- [x] Communication Phase 4: owner self-service WhatsApp/Email integration setup, provider status states, real connection tests, one server-side sender with consent + idempotency, message log, owner-started inbox conversation, signed delivery webhooks, new Message Customers / Integrations permissions
- [ ] Communication Phase 4: run `docs/sql/communication_phase4.sql` once in Supabase, then store the credentials (WhatsApp access token, email API key, webhook secrets)
