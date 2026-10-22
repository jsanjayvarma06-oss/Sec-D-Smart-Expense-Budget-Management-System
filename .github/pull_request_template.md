## What this changes

<!-- One or two sentences. Link the project item, e.g. "Closes #12". -->

## Requirements covered

<!-- FR / NFR / SR IDs, e.g. FR03, SR05 -->

## How it was tested

- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Checked in the browser (list the screens)
- [ ] Test plan cases covered: <!-- e.g. UT_07, UT_08 -->

## Security checklist

- [ ] User data is read and written inside `withUser()` and queries filter by `user_id` (SR04)
- [ ] Routes with an `:id` use `validateIdParam()` and return 404 for other users' records
- [ ] New input is validated on the server (SR05)
- [ ] No amounts, tokens or passwords are logged or returned in errors (SR10)
- [ ] Nothing was added to `PUBLIC_ROUTES` unless it must work without logging in (SR08)
- [ ] New tables with a `user_id` column have row-level security (see CONTRIBUTING.md)
