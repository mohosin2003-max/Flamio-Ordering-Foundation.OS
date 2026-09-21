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
- [ ] Signed-in general reviews + video need the SQL in `docs/sql/review_general_media.sql` applied to the external database (plus the private `review-photos` bucket)

## Future (separate phases, not started)
- [ ] Multi-restaurant / multi-tenant SaaS architecture with master admin
