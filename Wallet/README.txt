NAIJADROPS - WALLET + THEME FIXES
=================================
BEFORE:  git add -A ; git commit -m "before wallet"
RUN:     put this Wallet folder in your repo root, then from the repo root:
           powershell -ExecutionPolicy Bypass -File .\Wallet\00-Run-All.ps1
         then  npm run build  ->  commit  ->  deploy.
If you changed a file since you sent me the repo, the script STOPS and lists it before writing anything.

01  Terms/Privacy/Delete-account/FAQ/Contact/About now use the site's dark theme (the logo no longer
    vanishes). The page is dark from the first paint (no light flash). Footer: removed the two
    non-clickable badges ("Secure Payments", "24/7 Support"); only real links remain. FAQ no longer
    promises 24/7 support. Scheduling in step 3 appears only once fully loaded and refreshes quietly.
02  The wallet. See WALLET_SPEC.md.

ALREADY LIVE ON YOUR SUPABASE (nothing to run): customer_wallet migration (tables, rules, refunds).
The wallet does nothing until this code is deployed, and existing orders are unaffected.

AFTER DEPLOY, TEST WITH A SMALL REAL AMOUNT
1. /wallet: top up 500 with a card. Balance should show 500 and history one row.
2. Create an order, accept a rider, open the payment page: "Pay with Wallet" appears if the balance covers it.
3. Cancel a wallet-paid order before pickup: the money returns and Ops > Payments still says all balances match.
4. Ops > Payments shows the total held in wallets.

ONE THING TO CHECK: your support hours. Contact says 8:00 AM - 9:00 PM daily; Support says Mon-Sat 8am-8pm.
Pick the real one and make both pages match.
