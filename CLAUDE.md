# Studio Agent

## Goal
A customer service agent for a fictional studio ("Demo Studio"), modeled on a real
studio's public policies. Interview proof for an Agent Strategist role: keep it
simple, document decisions, and measure quality.

## Scope
In scope: members who want to book, reschedule, or cancel classes, freeze their
membership, or start a new membership.
Out of scope (say so and escalate): teacher training, workshops, class packs,
billing disputes, cancelling a membership entirely, anything else.

## Stack
Next.js, Supabase (data), Vercel (hosting). Claude API, server-side only,
starting with claude-haiku-5-5. Secrets live in .env.local (gitignored).

## Source of truth
- docs/policy.md is the only source for policy answers. Never write or invent
  policy. If the answer isn't in the file, say so and escalate.
- Demo assumption (not policy): one unlimited membership at a fixed price of
  $200/month. 
  Keep this in config, not in policy.md.
- Demo studio is in New York: cancellation window is 10 hours.

## Rules
- No real auth: a "pick a demo member" dropdown.
- All math, fees, and database writes happen in code, not in the model.
- Confirm with the member before booking, cancelling, rescheduling, or freezing.
- Reschedule = cancel + book, so late-cancel fee logic lives in one place.
- Log every model call, tool call, and escalation.

## Tools
check_schedule, book_class, cancel_class, reschedule_class, lookup_membership,
freeze_membership, start_membership, escalate_to_human

## Escalate to a human (hard-coded in code, not left to the model)
- Injury or medical questions
- Fee waivers or refunds
- Member asks for a person
- Two failed attempts on the same request
- Out of scope or not covered in policy.md

## Evals
Keep 20 test conversations in /evals with expected outcomes: normal requests,
edge cases (cancel right at the cutoff, no-show), policy questions, escalations,
and adversarial ones. Track pass rate, resolution rate, and correct escalation rate.

## Process
- Work in small pieces. Propose a plan before writing code.
- Commit after each working piece.
- Add a line to docs/decisions.md for each major choice (constraint, choice, trade-off).