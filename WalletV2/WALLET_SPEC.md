# NaijaDrops Wallet: completed spec (as built)

This finishes the plan you sent, with the changes that were needed to make it work in the real system.

## What changed from the original plan, and why
| Original plan | As built | Reason |
|---|---|---|
| Table `wallet_transactions` | **`wallet_ledger`** | `wallet_transactions` already exists: it is the **rider payout** table, with real data. |
| `pay_order_from_wallet` also set `status = 'matched'` | Only marks the order **paid** | Paying never changes who is matched. That would have broken pay-at-pickup and scheduled orders. |
| Wallet pay = a different path to "paid" | Same follow-up as card: price locked, delivery PIN, rider dispatch | One definition of "an order is paid". |
| Ledger `user_id ON DELETE CASCADE` | **`RESTRICT`** | Deleting an account must never delete financial history. |
| Transaction `status` column (pending/failed/reversed) | Removed | Only completed movements are written, so every row is final. |
| Wallet created at sign-up | Created on first use | Covers every existing user; no change to the sign-up trigger. |
| Refund "in 1 millisecond" | Instant, only when cancelled **before pickup** | After pickup a rider has already worked, so ops decide. |
| (not covered) | **Double-use guard** | A top-up payment must never also pay for an order (and the reverse). |

## Data model
- `user_wallets(user_id unique, balance numeric(12,2) >= 0, is_locked)`
- `wallet_ledger(wallet_id, user_id, amount > 0, type credit|debit, category topup|order_payment|refund|bonus|adjustment, reference UNIQUE, order_id, balance_before, balance_after, description, metadata)`
  - A CHECK ties `balance_after` to `balance_before` +/- `amount`.
  - Triggers block every UPDATE, DELETE and TRUNCATE: the ledger is append-only.
- `orders.payment_method` = `paystack` | `wallet` (existing paid orders backfilled as `paystack`).

## Money rules (all in the database, in one transaction each)
- `wallet_credit(user, amount, reference, category, ...)`: locks the wallet row, returns `duplicate` if the reference exists (so webhook retries cannot double-credit), rejects non-positive or fractional-kobo amounts.
- `wallet_pay_order(user, order)`: locks the order, then the wallet. Checks owner, not already paid, payable status, price, not locked, enough balance. Then debits, writes the ledger and marks the order paid together.
- `wallet_refund_cancelled_order()` (trigger): paid by wallet + cancelled while `pending`, `looking_for_driver` or `matched` => credit once (`refund:<order id>`), order becomes `refunded`.
- `wallet_reconciliation()`: wallets, total balance (what you owe customers) and how many balances disagree with their ledger.
- Only the server (service role) can run these. Signed-in users can only **read their own** wallet and history.

## Flows
1. **Top up** (`/wallet`): Paystack inline with metadata `{purpose: wallet_topup, userId}` -> `POST /api/wallet/verify-topup` -> Paystack verify (success, NGN, purpose, *this* user, not already an order payment) -> `wallet_credit`. The Paystack webhook does the same for closed browsers.
2. **Pay** (`/payment`): enough balance => one-tap "Pay with Wallet" -> `POST /api/wallet/pay-order` -> dispatch. Not enough => shows the shortfall and "Top up X and pay", then returns to the payment page.
3. **Refund**: cancel before pickup => money returns by trigger, whoever cancels (vendor, ops, expiry).
4. **Delete account**: refused while the balance is above zero; an account with ledger history is anonymised, never hard-deleted.

## Limits and decisions you can change
- Top-up: min 500, max 100,000 (`src/utils/wallet.js`). Enforced on screen. The database never refuses money that Paystack already collected.
- No cash-out; wallet money is spendable only on deliveries.
- Rider earnings and payouts are untouched (separate system).

## Edge cases covered (tested against your live database, rolled back)
Top-up twice with the same reference = one credit. Negative or bad-category credit refused. Paying twice = already paid, balance unchanged. Another user paying your order refused. Insufficient funds changes nothing. Cancel after wallet payment = exactly one refund. Editing or deleting ledger rows refused. Negative balance refused. Locked wallet cannot pay but still receives refunds. Reconciliation shows 0 mismatches.

## Risks to decide on (outside the code)
- **Regulation:** holding customer money may need a legal check (CBN rules on stored value / prepaid). A closed-loop credit for your own deliveries is usually lighter-touch, but get advice before you promote it. The terms text added is a draft.
- **Cash:** wallet balances are money you owe customers; keep at least that amount in your Paystack balance (shown on Ops > Payments).
- **Support:** cancellations after pickup are not auto-refunded; ops can add a credit using `wallet_credit` with category `adjustment`.

## Not built (next)
Ops screen to lock/unlock a wallet and issue adjustments; low-balance prompts; promo bonuses.
