# Remove the `recovery` honeypot from registration

**Atomic task.** Deletes the hidden-field honeypot from the registration handler. It is
redundant with the rate limiter (and will be fully superseded by server-side bot
verification), and removing it now ensures no redesigned form is ever built around a hidden
honeypot field.

## Current state
`createNewMember` in `src/server/controllers/createAccountController.ts` has a `recovery`
honeypot block near the top: it reads a hidden `recovery` form field and, if it is non-empty
(a bot filled it), logs the event and rejects the request.

## Do
- Delete the `recovery` honeypot block and its associated logging from `createNewMember`.
- Do **not** add any hidden field anywhere. The `createAccountLimiter` rate limiter on
  `/register` still applies and is unaffected.
- Remove any now-unused imports the deletion leaves behind (`npm run lint --silent` lists
  them).

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- No `recovery` honeypot handling remains in `createNewMember`.
- Registration still works (a normal POST is accepted as before).
