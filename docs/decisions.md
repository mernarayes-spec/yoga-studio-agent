# Decisions

| # | Constraint / Question | Choice | Trade-off |
|---|---|---|---|
| 1 | Drop-in classes? | No — members only. Non-members get offered a membership or escalation. | Simpler booking logic; excludes casual visitors. |
| 2 | How to enforce confirmations before mutations? | Pending-action pattern in code — agent proposes, user confirms, code executes. | More code than prompt-only, but deterministic and testable. |
| 3 | How to make time-dependent logic testable? | Injectable `getNow(override?)` used everywhere instead of `new Date()`. | Tiny overhead; enables deterministic eval tests at cancel-window boundaries. |
| 4 | Single or dual escalation path? | Dual: code pre-checks (injury keywords, retry count) + model `escalate_to_human` tool, logged separately. | More escalation surface; avoids relying solely on model judgment for safety-critical escalations. |
| 5 | Build order? | Cancel-class end-to-end first (book → cancel with fee logic), then expand to reschedule, freeze, membership. | Slower feature coverage up front; proves the full stack early and catches integration issues. |
| 6 | Change-log practice? | Every major choice logged here per CLAUDE.md process rules. | Small overhead per change; creates an audit trail for interview review. |
